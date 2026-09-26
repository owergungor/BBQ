use serde::{Deserialize, Serialize};

pub const MAX_DROP_ITEMS: usize = 50;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DropTargetKind {
    File,
    Directory,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileClassification {
    Image,
    Document,
    Archive,
    Code,
    Audio,
    Video,
    Unknown,
}

pub fn classify_extension(ext: Option<&str>) -> FileClassification {
    let ext = match ext {
        Some(e) => e.to_lowercase(),
        None => return FileClassification::Unknown,
    };

    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" => {
            FileClassification::Image
        }
        "txt" | "md" | "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "csv" | "rtf" => {
            FileClassification::Document
        }
        "zip" | "7z" | "tar" | "gz" | "rar" | "bz2" | "xz" => FileClassification::Archive,
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "java" | "cpp" | "c" | "h" | "html" | "css"
        | "json" | "toml" | "yaml" | "yml" | "sh" | "bat" => FileClassification::Code,
        "mp3" | "wav" | "flac" | "m4a" | "ogg" | "aac" => FileClassification::Audio,
        "mp4" | "mov" | "mkv" | "webm" | "avi" => FileClassification::Video,
        _ => FileClassification::Unknown,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DropTarget {
    pub id: String,
    pub path: String,
    pub kind: DropTargetKind,
    pub name: String,
    pub size: u64,
    pub modified_at: Option<i64>,
    pub extension: Option<String>,
    pub classification: FileClassification,
}

impl DropTarget {
    pub fn new(
        id: impl Into<String>,
        path: impl Into<String>,
        kind: DropTargetKind,
        name: impl Into<String>,
        size: u64,
        modified_at: Option<i64>,
        extension: Option<String>,
    ) -> Self {
        let ext_ref = extension.as_deref();
        let classification = match kind {
            DropTargetKind::File => classify_extension(ext_ref),
            _ => FileClassification::Unknown,
        };

        Self {
            id: id.into(),
            path: path.into(),
            kind,
            name: name.into(),
            size,
            modified_at,
            extension,
            classification,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DropBatch {
    pub id: String,
    pub items: Vec<DropTarget>,
    pub count: usize,
    pub created_at: u64,
}

impl DropBatch {
    pub fn new(id: impl Into<String>, items: Vec<DropTarget>, created_at: u64) -> Self {
        let count = items.len();
        Self {
            id: id.into(),
            items,
            count,
            created_at,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DropAction {
    Open,
    Reveal,
    CopyPath,
    AddToWorkspace,
    DragOut,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DropActionResult {
    pub success_count: usize,
    pub failure_count: usize,
    pub message: String,
}

pub fn format_drop_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;

    if bytes >= GB {
        format!("{:.1} GB", (bytes as f64) / (GB as f64))
    } else if bytes >= MB {
        format!("{:.1} MB", (bytes as f64) / (MB as f64))
    } else if bytes >= KB {
        format!("{:.1} KB", (bytes as f64) / (KB as f64))
    } else {
        format!("{} B", bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_classification() {
        assert_eq!(classify_extension(Some("png")), FileClassification::Image);
        assert_eq!(classify_extension(Some("JPG")), FileClassification::Image);
        assert_eq!(
            classify_extension(Some("pdf")),
            FileClassification::Document
        );
        assert_eq!(classify_extension(Some("zip")), FileClassification::Archive);
        assert_eq!(classify_extension(Some("rs")), FileClassification::Code);
        assert_eq!(classify_extension(Some("mp3")), FileClassification::Audio);
        assert_eq!(classify_extension(Some("mp4")), FileClassification::Video);
        assert_eq!(
            classify_extension(Some("unknown")),
            FileClassification::Unknown
        );
        assert_eq!(classify_extension(None), FileClassification::Unknown);
    }

    #[test]
    fn test_drop_target_creation() {
        let file = DropTarget::new(
            "drop_1",
            "C:/docs/report.pdf",
            DropTargetKind::File,
            "report.pdf",
            2048,
            Some(1700000000),
            Some("pdf".to_string()),
        );
        assert_eq!(file.kind, DropTargetKind::File);
        assert_eq!(file.classification, FileClassification::Document);
        assert_eq!(file.size, 2048);

        let dir = DropTarget::new(
            "drop_2",
            "C:/docs",
            DropTargetKind::Directory,
            "docs",
            0,
            Some(1700000000),
            None,
        );
        assert_eq!(dir.kind, DropTargetKind::Directory);
        assert_eq!(dir.classification, FileClassification::Unknown);
    }

    #[test]
    fn test_drop_batch_bounds() {
        let items: Vec<DropTarget> = (0..MAX_DROP_ITEMS)
            .map(|i| {
                DropTarget::new(
                    format!("drop_{}", i),
                    format!("C:/docs/file_{}.txt", i),
                    DropTargetKind::File,
                    format!("file_{}.txt", i),
                    1024,
                    None,
                    Some("txt".to_string()),
                )
            })
            .collect();

        let batch = DropBatch::new("batch_1", items, 1000);
        assert_eq!(batch.count, 50);
        assert_eq!(batch.items.len(), 50);
    }

    #[test]
    fn test_format_drop_size() {
        assert_eq!(format_drop_size(500), "500 B");
        assert_eq!(format_drop_size(2048), "2.0 KB");
        assert_eq!(format_drop_size(2_500_000), "2.4 MB");
        assert_eq!(format_drop_size(1_500_000_000), "1.4 GB");
    }

    #[test]
    fn test_serde_roundtrip() {
        let target = DropTarget::new(
            "t1",
            "/tmp/test.png",
            DropTargetKind::File,
            "test.png",
            5000,
            Some(123456),
            Some("png".to_string()),
        );
        let serialized = serde_json::to_string(&target).unwrap();
        let deserialized: DropTarget = serde_json::from_str(&serialized).unwrap();
        assert_eq!(target, deserialized);

        let action = DropAction::CopyPath;
        let action_ser = serde_json::to_string(&action).unwrap();
        assert_eq!(action_ser, "\"copy_path\"");
        let action_de: DropAction = serde_json::from_str(&action_ser).unwrap();
        assert_eq!(action_de, DropAction::CopyPath);
    }
}
