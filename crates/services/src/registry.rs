use crate::traits::{Service, ServiceStatus};
use bbq_core::BbqResult;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Thread-safe registry that coordinates service lifecycles with strict failure isolation
#[derive(Clone)]
pub struct ServiceRegistry {
    services: HashMap<&'static str, Arc<dyn Service>>,
    order: Vec<&'static str>,
    stopped: Arc<AtomicBool>,
}

impl std::fmt::Debug for ServiceRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ServiceRegistry")
            .field("registered_services", &self.order)
            .field("stopped", &self.stopped.load(Ordering::Relaxed))
            .finish()
    }
}

impl Default for ServiceRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ServiceRegistry {
    pub fn new() -> Self {
        Self {
            services: HashMap::new(),
            order: Vec::new(),
            stopped: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Register a service into the registry
    pub fn register(&mut self, service: Arc<dyn Service>) {
        let name = service.name();
        self.services.insert(name, service);
        if !self.order.contains(&name) {
            self.order.push(name);
        }
    }

    /// Initialize all registered services in registration/dependency order;
    /// isolates failures so one failing service does not crash BBQ
    pub async fn init_all(&self) -> BbqResult<()> {
        for name in &self.order {
            if let Some(service) = self.services.get(name) {
                match service.init().await {
                    Ok(()) => {
                        tracing::info!("Service '{}' initialized successfully", name);
                    }
                    Err(err) => {
                        tracing::error!(
                            "Service '{}' failed to initialize: {}. Continuing gracefully.",
                            name,
                            err
                        );
                    }
                }
            }
        }
        Ok(())
    }

    /// Stop all registered services in reverse dependency order.
    /// Each service stop is bounded by a 500ms timeout so a hanging service does not block shutdown.
    /// Shutdown is idempotent: calling stop_all multiple times is safe and a no-op.
    pub async fn stop_all(&self) -> BbqResult<()> {
        if self.stopped.swap(true, Ordering::SeqCst) {
            tracing::info!(
                "ServiceRegistry::stop_all already executed; skipping redundant shutdown."
            );
            return Ok(());
        }

        tracing::info!("Starting ServiceRegistry controlled shutdown in reverse dependency order");
        for &name in self.order.iter().rev() {
            if let Some(service) = self.services.get(name) {
                tracing::info!("Stopping service '{}'...", name);
                match tokio::time::timeout(Duration::from_millis(500), service.stop()).await {
                    Ok(Ok(())) => {
                        tracing::info!("Service '{}' stopped successfully.", name);
                    }
                    Ok(Err(e)) => {
                        tracing::warn!(
                            "Service '{}' reported error on stop: {}. Continuing shutdown.",
                            name,
                            e
                        );
                    }
                    Err(_) => {
                        tracing::warn!(
                            "Service '{}' stop timed out after 500ms. Continuing shutdown.",
                            name
                        );
                    }
                }
            }
        }
        tracing::info!("ServiceRegistry shutdown complete.");
        Ok(())
    }

    /// Get status report across all registered services
    pub fn get_statuses(&self) -> Vec<ServiceStatus> {
        self.order
            .iter()
            .filter_map(|name| self.services.get(name))
            .map(|s| s.status())
            .collect()
    }

    /// Retrieve a service reference by its identifier
    pub fn get(&self, name: &str) -> Option<Arc<dyn Service>> {
        self.services.get(name).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::traits::{ServiceState, ServiceStatus};
    use async_trait::async_trait;
    use std::sync::atomic::AtomicUsize;
    use std::sync::Mutex;

    struct TestService {
        name: &'static str,
        stop_log: Arc<Mutex<Vec<&'static str>>>,
        stop_delay_ms: u64,
        fail_stop: bool,
        stop_count: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl Service for TestService {
        fn name(&self) -> &'static str {
            self.name
        }

        async fn init(&self) -> BbqResult<()> {
            Ok(())
        }

        async fn start(&self) -> BbqResult<()> {
            Ok(())
        }

        async fn stop(&self) -> BbqResult<()> {
            self.stop_count.fetch_add(1, Ordering::SeqCst);
            if self.stop_delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(self.stop_delay_ms)).await;
            }
            if self.fail_stop {
                return Err(bbq_core::BbqError::Platform(
                    "Forced stop failure".to_string(),
                ));
            }
            if let Ok(mut log) = self.stop_log.lock() {
                log.push(self.name);
            }
            Ok(())
        }

        fn status(&self) -> ServiceStatus {
            ServiceStatus {
                name: self.name,
                state: ServiceState::Active,
                message: None,
            }
        }
    }

    #[tokio::test]
    async fn test_service_registry_stop_all_reverse_order_and_idempotency() {
        let mut registry = ServiceRegistry::new();
        let log = Arc::new(Mutex::new(Vec::new()));
        let s1_count = Arc::new(AtomicUsize::new(0));
        let s2_count = Arc::new(AtomicUsize::new(0));
        let s3_count = Arc::new(AtomicUsize::new(0));

        let s1 = Arc::new(TestService {
            name: "DatabaseService",
            stop_log: log.clone(),
            stop_delay_ms: 0,
            fail_stop: false,
            stop_count: s1_count.clone(),
        });
        let s2 = Arc::new(TestService {
            name: "PlatformService",
            stop_log: log.clone(),
            stop_delay_ms: 0,
            fail_stop: false,
            stop_count: s2_count.clone(),
        });
        let s3 = Arc::new(TestService {
            name: "UiService",
            stop_log: log.clone(),
            stop_delay_ms: 0,
            fail_stop: false,
            stop_count: s3_count.clone(),
        });

        registry.register(s1);
        registry.register(s2);
        registry.register(s3);

        // First shutdown
        registry.stop_all().await.expect("stop_all succeeds");

        // Verify reverse dependency order: UiService -> PlatformService -> DatabaseService
        let execution_order = log.lock().unwrap().clone();
        assert_eq!(
            execution_order,
            vec!["UiService", "PlatformService", "DatabaseService"]
        );

        assert_eq!(s1_count.load(Ordering::SeqCst), 1);
        assert_eq!(s2_count.load(Ordering::SeqCst), 1);
        assert_eq!(s3_count.load(Ordering::SeqCst), 1);

        // Repeated shutdown is idempotent (no second stop called)
        registry
            .stop_all()
            .await
            .expect("repeated stop_all succeeds");
        assert_eq!(s1_count.load(Ordering::SeqCst), 1);
        assert_eq!(s2_count.load(Ordering::SeqCst), 1);
        assert_eq!(s3_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_service_registry_stop_all_timeout_bounded_and_failure_isolated() {
        let mut registry = ServiceRegistry::new();
        let log = Arc::new(Mutex::new(Vec::new()));

        let hanging_service = Arc::new(TestService {
            name: "HangingService",
            stop_log: log.clone(),
            stop_delay_ms: 2000, // exceeds 500ms limit
            fail_stop: false,
            stop_count: Arc::new(AtomicUsize::new(0)),
        });
        let failing_service = Arc::new(TestService {
            name: "FailingService",
            stop_log: log.clone(),
            stop_delay_ms: 0,
            fail_stop: true,
            stop_count: Arc::new(AtomicUsize::new(0)),
        });
        let normal_service = Arc::new(TestService {
            name: "NormalService",
            stop_log: log.clone(),
            stop_delay_ms: 0,
            fail_stop: false,
            stop_count: Arc::new(AtomicUsize::new(0)),
        });

        registry.register(normal_service);
        registry.register(failing_service);
        registry.register(hanging_service);

        let start = std::time::Instant::now();
        registry
            .stop_all()
            .await
            .expect("stop_all succeeds even with timeouts and errors");
        let elapsed = start.elapsed();

        // Must be bounded around ~500ms timeout for hanging service, not hanging indefinitely (2000ms)
        assert!(elapsed < Duration::from_millis(1200));

        // Normal service must still have received and completed stop
        let execution_order = log.lock().unwrap().clone();
        assert!(execution_order.contains(&"NormalService"));
    }

    struct InitTestService {
        name: &'static str,
        init_log: Arc<Mutex<Vec<&'static str>>>,
        fail_init: bool,
    }

    #[async_trait]
    impl Service for InitTestService {
        fn name(&self) -> &'static str {
            self.name
        }

        async fn init(&self) -> BbqResult<()> {
            if self.fail_init {
                return Err(bbq_core::BbqError::Platform(
                    "Forced init failure".to_string(),
                ));
            }
            if let Ok(mut log) = self.init_log.lock() {
                log.push(self.name);
            }
            Ok(())
        }

        async fn start(&self) -> BbqResult<()> {
            Ok(())
        }

        async fn stop(&self) -> BbqResult<()> {
            Ok(())
        }

        fn status(&self) -> ServiceStatus {
            ServiceStatus {
                name: self.name,
                state: ServiceState::Active,
                message: None,
            }
        }
    }

    #[tokio::test]
    async fn test_service_registry_init_all_order_and_failure_isolation() {
        let mut registry = ServiceRegistry::new();
        let log = Arc::new(Mutex::new(Vec::new()));

        let s1 = Arc::new(InitTestService {
            name: "FirstService",
            init_log: log.clone(),
            fail_init: false,
        });
        let s2 = Arc::new(InitTestService {
            name: "FailingService",
            init_log: log.clone(),
            fail_init: true,
        });
        let s3 = Arc::new(InitTestService {
            name: "ThirdService",
            init_log: log.clone(),
            fail_init: false,
        });

        registry.register(s1);
        registry.register(s2);
        registry.register(s3);

        let res = registry.init_all().await;
        assert!(
            res.is_ok(),
            "init_all must return Ok even when individual service fails"
        );

        let order = log.lock().unwrap().clone();
        assert_eq!(order, vec!["FirstService", "ThirdService"]);
    }

    #[tokio::test]
    async fn test_shutdown_all_services_successful() {
        let mut registry = ServiceRegistry::new();
        let log = Arc::new(Mutex::new(Vec::new()));
        let c1 = Arc::new(AtomicUsize::new(0));
        let c2 = Arc::new(AtomicUsize::new(0));

        let s1 = Arc::new(TestService {
            name: "ServiceA",
            stop_log: log.clone(),
            stop_delay_ms: 0,
            fail_stop: false,
            stop_count: c1.clone(),
        });
        let s2 = Arc::new(TestService {
            name: "ServiceB",
            stop_log: log.clone(),
            stop_delay_ms: 0,
            fail_stop: false,
            stop_count: c2.clone(),
        });

        registry.register(s1);
        registry.register(s2);

        registry.stop_all().await.expect("clean shutdown succeeds");

        assert_eq!(c1.load(Ordering::SeqCst), 1);
        assert_eq!(c2.load(Ordering::SeqCst), 1);
        let order = log.lock().unwrap().clone();
        assert_eq!(
            order,
            vec!["ServiceB", "ServiceA"],
            "Reverse registration order required"
        );
    }

    #[tokio::test]
    async fn test_shutdown_one_service_returning_err() {
        let mut registry = ServiceRegistry::new();
        let log = Arc::new(Mutex::new(Vec::new()));
        let fail_count = Arc::new(AtomicUsize::new(0));
        let normal_count = Arc::new(AtomicUsize::new(0));

        let s1 = Arc::new(TestService {
            name: "HealthyService",
            stop_log: log.clone(),
            stop_delay_ms: 0,
            fail_stop: false,
            stop_count: normal_count.clone(),
        });
        let s2 = Arc::new(TestService {
            name: "ErrService",
            stop_log: log.clone(),
            stop_delay_ms: 0,
            fail_stop: true,
            stop_count: fail_count.clone(),
        });

        registry.register(s1);
        registry.register(s2);

        // stop_all must succeed and not panic or abort early
        let res = registry.stop_all().await;
        assert!(res.is_ok(), "stop_all succeeds despite service error");

        assert_eq!(fail_count.load(Ordering::SeqCst), 1);
        assert_eq!(
            normal_count.load(Ordering::SeqCst),
            1,
            "Healthy service must still stop"
        );
        let order = log.lock().unwrap().clone();
        assert!(order.contains(&"HealthyService"));
    }

    #[tokio::test]
    async fn test_shutdown_one_service_exceeding_timeout() {
        let mut registry = ServiceRegistry::new();
        let normal_count = Arc::new(AtomicUsize::new(0));

        let normal = Arc::new(TestService {
            name: "NormalService",
            stop_log: Arc::new(Mutex::new(Vec::new())),
            stop_delay_ms: 0,
            fail_stop: false,
            stop_count: normal_count.clone(),
        });
        let slow = Arc::new(TestService {
            name: "SlowService",
            stop_log: Arc::new(Mutex::new(Vec::new())),
            stop_delay_ms: 2000, // 2s > 500ms bound
            fail_stop: false,
            stop_count: Arc::new(AtomicUsize::new(0)),
        });

        registry.register(normal);
        registry.register(slow);

        let start = std::time::Instant::now();
        let res = registry.stop_all().await;
        let elapsed = start.elapsed();

        assert!(res.is_ok());
        // Must be bounded close to 500ms, not blocking for 2000ms
        assert!(elapsed < Duration::from_millis(1200));
        assert_eq!(normal_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_shutdown_repeated_stop_all() {
        let mut registry = ServiceRegistry::new();
        let count = Arc::new(AtomicUsize::new(0));
        let s = Arc::new(TestService {
            name: "SingleService",
            stop_log: Arc::new(Mutex::new(Vec::new())),
            stop_delay_ms: 0,
            fail_stop: false,
            stop_count: count.clone(),
        });

        registry.register(s);

        assert!(registry.stop_all().await.is_ok());
        assert_eq!(count.load(Ordering::SeqCst), 1);

        // Repeated calls
        assert!(registry.stop_all().await.is_ok());
        assert!(registry.stop_all().await.is_ok());
        assert_eq!(
            count.load(Ordering::SeqCst),
            1,
            "Subsequent stop_all must be no-ops"
        );
    }

    #[tokio::test]
    async fn test_shutdown_failure_isolation() {
        let mut registry = ServiceRegistry::new();
        let log = Arc::new(Mutex::new(Vec::new()));
        let after_count = Arc::new(AtomicUsize::new(0));

        let s_after = Arc::new(TestService {
            name: "ServiceAfterFailing",
            stop_log: log.clone(),
            stop_delay_ms: 0,
            fail_stop: false,
            stop_count: after_count.clone(),
        });
        let s_fail = Arc::new(TestService {
            name: "FailingService",
            stop_log: log.clone(),
            stop_delay_ms: 0,
            fail_stop: true,
            stop_count: Arc::new(AtomicUsize::new(0)),
        });

        // Registered in order: s_after, then s_fail
        // Shutdown order (reversed): s_fail, then s_after
        registry.register(s_after);
        registry.register(s_fail);

        let res = registry.stop_all().await;
        assert!(res.is_ok());
        assert_eq!(
            after_count.load(Ordering::SeqCst),
            1,
            "Failure in earlier stopped service must not block subsequent services"
        );
        let order = log.lock().unwrap().clone();
        assert!(order.contains(&"ServiceAfterFailing"));
    }
}
