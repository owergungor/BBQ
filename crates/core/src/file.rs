use serde::{Deserialize, Serialize};

/// Represents a file reference stored in the BBQ workspace
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub extension: Option<String>,
    pub mime_type: Option<String>,
    pub size_bytes: u64,
    pub modified_at: Option<i64>,
    pub created_at: i64,
    pub source: Option<String>,
    pub missing: bool,
}

impl FileEntry {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        id: String,
        name: String,
        path: String,
        extension: Option<String>,
        mime_type: Option<String>,
        size_bytes: u64,
        modified_at: Option<i64>,
        created_at: i64,
        source: Option<String>,
    ) -> Self {
        Self {
            id,
            name,
            path,
            extension,
            mime_type,
            size_bytes,
            modified_at,
            created_at,
            source,
            missing: false,
        }
    }

    /// Return a human-readable representation of the file's size
    pub fn human_readable_size(&self) -> String {
        format_size_bytes(self.size_bytes)
    }
}

/// Format a byte count into a human-readable string (e.g. "2.4 MB", "850 KB", "12 B")
pub fn format_size_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;
    const TB: u64 = 1024 * GB;

    if bytes >= TB {
        format!("{:.1} TB", bytes as f64 / TB as f64)
    } else if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

/// Lightweight extension-to-MIME mapper that does not inspect file contents
pub fn guess_mime_type(extension: &str) -> &'static str {
    match extension.to_ascii_lowercase().as_str() {
        // Documents
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" | "markdown" => "text/markdown",
        "csv" => "text/csv",
        "rtf" => "application/rtf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",

        // Web & Code
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "js" | "mjs" | "cjs" => "text/javascript",
        "ts" | "mts" | "cts" => "text/typescript",
        "json" => "application/json",
        "xml" => "application/xml",
        "rs" => "text/rust",
        "py" => "text/x-python",
        "sh" => "application/x-sh",
        "yaml" | "yml" => "text/yaml",

        // Images
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "tiff" | "tif" => "image/tiff",

        // Audio
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" | "aac" => "audio/mp4",

        // Video
        "mp4" => "video/mp4",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",

        // Archives
        "zip" => "application/zip",
        "tar" => "application/x-tar",
        "gz" => "application/gzip",
        "7z" => "application/x-7z-compressed",
        "rar" => "application/vnd.rar",

        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_size_bytes() {
        assert_eq!(format_size_bytes(0), "0 B");
        assert_eq!(format_size_bytes(512), "512 B");
        assert_eq!(format_size_bytes(1024), "1.0 KB");
        assert_eq!(format_size_bytes(1024 * 1024 * 2 + 500_000), "2.5 MB");
        assert_eq!(format_size_bytes(1024 * 1024 * 1024 * 3), "3.0 GB");
    }

    #[test]
    fn test_guess_mime_type() {
        assert_eq!(guess_mime_type("pdf"), "application/pdf");
        assert_eq!(guess_mime_type("PDF"), "application/pdf");
        assert_eq!(guess_mime_type("png"), "image/png");
        assert_eq!(guess_mime_type("rs"), "text/rust");
        assert_eq!(guess_mime_type("unknown_ext"), "application/octet-stream");
    }

    #[test]
    fn test_file_entry_serialization() {
        let entry = FileEntry::new(
            "fe_123".to_string(),
            "document.pdf".to_string(),
            "/path/to/document.pdf".to_string(),
            Some("pdf".to_string()),
            Some("application/pdf".to_string()),
            1048576,
            Some(1600000000),
            1600000005,
            Some("drag_drop".to_string()),
        );

        assert_eq!(entry.human_readable_size(), "1.0 MB");
        assert!(!entry.missing);

        let json = serde_json::to_string(&entry).unwrap();
        let deserialized: FileEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(entry, deserialized);
    }
}
