#![allow(clippy::unwrap_used, clippy::panic)]

use bbq_services::{SettingsService, SettingsServiceTrait};
use bbq_storage::DatabaseManager;

#[test]
fn test_blur_and_transparency_settings_lifecycle() {
    let db = DatabaseManager::open_in_memory().expect("in-memory db");
    let service = SettingsService::new(db.settings_repository());

    // Defaults
    let s = service.get_settings().expect("get_settings");
    assert_eq!(s.island_blur, 20);
    assert_eq!(s.island_transparency, 0);
    assert!(!s.reduced_transparency);

    // Updates
    service
        .update_setting("island_blur", "34")
        .expect("update blur");
    service
        .update_setting("island_transparency", "25")
        .expect("update transparency");
    service
        .update_setting("reduced_transparency", "true")
        .expect("update reduced transparency");

    let s2 = service.get_settings().expect("get_settings");
    assert_eq!(s2.island_blur, 34);
    assert_eq!(s2.island_transparency, 25);
    assert!(s2.reduced_transparency);

    // Clamping & Bounds validation: blur is 0..=50, transparency is 0..=100
    assert!(service.update_setting("island_blur", "0").is_ok());
    assert!(service.update_setting("island_blur", "50").is_ok());
    assert!(service.update_setting("island_blur", "51").is_err());
    assert!(service.update_setting("island_blur", "-1").is_err());

    assert!(service.update_setting("island_transparency", "0").is_ok());
    assert!(service.update_setting("island_transparency", "100").is_ok());
    assert!(service
        .update_setting("island_transparency", "101")
        .is_err());
    assert!(service.update_setting("island_transparency", "-1").is_err());
}
