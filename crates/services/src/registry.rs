use crate::traits::{Service, ServiceStatus};
use bbq_core::BbqResult;
use std::collections::HashMap;
use std::sync::Arc;

/// Thread-safe registry that coordinates service lifecycles with strict failure isolation
pub struct ServiceRegistry {
    services: HashMap<&'static str, Arc<dyn Service>>,
}

impl std::fmt::Debug for ServiceRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let keys: Vec<&&'static str> = self.services.keys().collect();
        f.debug_struct("ServiceRegistry")
            .field("registered_services", &keys)
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
        }
    }

    /// Register a service into the registry
    pub fn register(&mut self, service: Arc<dyn Service>) {
        let name = service.name();
        self.services.insert(name, service);
    }

    /// Initialize all registered services; isolates failures so one failing service does not crash BBQ
    pub async fn init_all(&self) -> BbqResult<()> {
        for (name, service) in &self.services {
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
        Ok(())
    }

    /// Get status report across all registered services
    pub fn get_statuses(&self) -> Vec<ServiceStatus> {
        self.services.values().map(|s| s.status()).collect()
    }

    /// Retrieve a service reference by its identifier
    pub fn get(&self, name: &str) -> Option<Arc<dyn Service>> {
        self.services.get(name).cloned()
    }
}
