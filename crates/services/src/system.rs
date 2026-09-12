use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::{BbqResult, SystemCapabilities, SystemEvent, SystemState};
use bbq_platform::{PlatformSystem, SystemPowerInfo};
use std::sync::{Arc, RwLock};

#[async_trait]
pub trait SystemServiceTrait: Service {
    async fn get_state(&self) -> BbqResult<SystemState>;
    async fn get_capabilities(&self) -> BbqResult<SystemCapabilities>;
    async fn set_volume(&self, volume: f32) -> BbqResult<()>;
    async fn set_muted(&self, muted: bool) -> BbqResult<()>;
    async fn toggle_muted(&self) -> BbqResult<()>;
    async fn get_power_info(&self) -> BbqResult<SystemPowerInfo>;
    async fn get_idle_seconds(&self) -> BbqResult<u64>;
}

pub struct SystemService {
    platform: Arc<dyn PlatformSystem>,
    current_state: Arc<RwLock<SystemState>>,
    status: Arc<RwLock<ServiceStatus>>,
}

impl std::fmt::Debug for SystemService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SystemService").finish()
    }
}

impl SystemService {
    pub fn new(platform: Arc<dyn PlatformSystem>) -> Self {
        Self {
            platform,
            current_state: Arc::new(RwLock::new(SystemState::default())),
            status: Arc::new(RwLock::new(ServiceStatus {
                name: "SystemService",
                state: ServiceState::Inactive,
                message: None,
            })),
        }
    }
}

#[async_trait]
impl Service for SystemService {
    fn name(&self) -> &'static str {
        "SystemService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing SystemService");

        self.platform.initialize().await?;

        // Query initial system state
        if let Ok(state) = self.platform.current_state().await {
            if let Ok(mut lock) = self.current_state.write() {
                *lock = state;
            }
        }

        // Subscribe to event-driven push notifications
        let state_ref = self.current_state.clone();
        let status_ref = self.status.clone();

        self.platform
            .subscribe(Arc::new(move |event| match event {
                SystemEvent::StateChanged(s) => {
                    if let Ok(mut state_lock) = state_ref.write() {
                        *state_lock = s;
                    }
                }
                SystemEvent::BatteryChanged(b) => {
                    if let Ok(mut state_lock) = state_ref.write() {
                        state_lock.battery = b;
                    }
                }
                SystemEvent::NetworkChanged(n) => {
                    if let Ok(mut state_lock) = state_ref.write() {
                        state_lock.network = n;
                    }
                }
                SystemEvent::VolumeChanged { volume, muted } => {
                    if let Ok(mut state_lock) = state_ref.write() {
                        if let Some(v) = volume {
                            state_lock.volume = Some(v);
                        }
                        if let Some(m) = muted {
                            state_lock.muted = Some(m);
                        }
                    }
                }
                SystemEvent::Unavailable { reason } => {
                    if let Ok(mut status_lock) = status_ref.write() {
                        status_lock.message = Some(reason);
                    }
                }
            }))
            .await?;

        if let Ok(mut status_lock) = self.status.write() {
            status_lock.state = ServiceState::Active;
        }

        Ok(())
    }

    async fn start(&self) -> BbqResult<()> {
        if let Ok(mut status_lock) = self.status.write() {
            status_lock.state = ServiceState::Active;
        }
        Ok(())
    }

    async fn stop(&self) -> BbqResult<()> {
        if let Ok(mut status_lock) = self.status.write() {
            status_lock.state = ServiceState::Sleeping;
        }
        Ok(())
    }

    fn status(&self) -> ServiceStatus {
        if let Ok(guard) = self.status.read() {
            guard.clone()
        } else {
            ServiceStatus {
                name: self.name(),
                state: ServiceState::Active,
                message: None,
            }
        }
    }
}

#[async_trait]
impl SystemServiceTrait for SystemService {
    async fn get_state(&self) -> BbqResult<SystemState> {
        let lock = self
            .current_state
            .read()
            .map_err(|e| bbq_core::BbqError::Service {
                service: "SystemService",
                message: format!("Failed to read system state: {}", e),
            })?;
        Ok(lock.clone())
    }

    async fn get_capabilities(&self) -> BbqResult<SystemCapabilities> {
        self.platform.capabilities().await
    }

    async fn set_volume(&self, volume: f32) -> BbqResult<()> {
        self.platform.set_volume(volume).await?;
        if let Ok(mut lock) = self.current_state.write() {
            lock.volume = Some(volume.clamp(0.0, 1.0));
        }
        Ok(())
    }

    async fn set_muted(&self, muted: bool) -> BbqResult<()> {
        self.platform.set_muted(muted).await?;
        if let Ok(mut lock) = self.current_state.write() {
            lock.muted = Some(muted);
        }
        Ok(())
    }

    async fn toggle_muted(&self) -> BbqResult<()> {
        self.platform.toggle_muted().await?;
        if let Ok(state) = self.platform.current_state().await {
            if let Ok(mut lock) = self.current_state.write() {
                lock.muted = state.muted;
            }
        }
        Ok(())
    }

    async fn get_power_info(&self) -> BbqResult<SystemPowerInfo> {
        self.platform.get_power_info().await
    }

    async fn get_idle_seconds(&self) -> BbqResult<u64> {
        self.platform.get_idle_seconds().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_core::{BatteryState, NetworkState};
    use bbq_platform::MockSystem;

    #[tokio::test]
    async fn test_system_service_lifecycle_and_state() {
        let mock = Arc::new(MockSystem::default());
        let service = SystemService::new(mock.clone());

        assert_eq!(service.status().state, ServiceState::Inactive);

        service.init().await.expect("Init must succeed");
        assert_eq!(service.status().state, ServiceState::Active);

        let state = service.get_state().await.expect("State read");
        assert_eq!(state.battery.percentage, Some(100));
        assert!(state.network.connected);

        let caps = service.get_capabilities().await.expect("Caps read");
        assert!(caps.has_battery);
        assert!(caps.can_control_volume);

        // Test volume controls
        service.set_volume(0.65).await.expect("Set volume");
        let updated = service.get_state().await.unwrap();
        assert_eq!(updated.volume, Some(0.65));

        // Test mute controls
        service.set_muted(true).await.expect("Set muted");
        let muted_state = service.get_state().await.unwrap();
        assert_eq!(muted_state.muted, Some(true));

        service.toggle_muted().await.expect("Toggle muted");
        let unmuted_state = service.get_state().await.unwrap();
        assert_eq!(unmuted_state.muted, Some(false));

        // Test stop transitions to sleeping
        service.stop().await.expect("Stop must succeed");
        assert_eq!(service.status().state, ServiceState::Sleeping);
    }

    #[tokio::test]
    async fn test_system_service_event_simulation() {
        let mock = Arc::new(MockSystem::default());
        let service = SystemService::new(mock.clone());
        service.init().await.unwrap();

        // Simulate battery drop to 42%
        mock.simulate_battery_change(BatteryState {
            available: true,
            percentage: Some(42),
            charging: false,
            plugged_in: false,
            power_source: Some("Battery".to_string()),
        });

        // Small yield to allow event task to execute
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        let state = service.get_state().await.unwrap();
        assert_eq!(state.battery.percentage, Some(42));
        assert!(!state.battery.charging);

        // Simulate network disconnect
        mock.simulate_network_change(NetworkState {
            connected: false,
            interface_name: None,
            connection_type: None,
            signal_strength: None,
        });

        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        let net_state = service.get_state().await.unwrap();
        assert!(!net_state.network.connected);
    }
}
