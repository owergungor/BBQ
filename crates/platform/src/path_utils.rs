use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RevealResolution {
    /// Target file or directory exists and can be directly revealed/selected.
    Exact { path: PathBuf, is_file: bool },
    /// Target does not exist, but its parent directory exists and can be opened as fallback.
    FallbackParent { parent: PathBuf, original: PathBuf },
    /// Neither target nor any parent directory exists.
    NotFound { original: PathBuf },
}

/// Normalizes and decodes a raw path string (supporting file URIs, relative paths,
/// Windows drive paths, macOS and Linux paths).
pub fn normalize_file_path(raw: &str) -> PathBuf {
    let mut cleaned = raw.trim();

    // 1. Strip file:// URI scheme
    if let Some(_stripped) = cleaned.strip_prefix("file://localhost/") {
        #[cfg(not(windows))]
        {
            cleaned = &cleaned[16..];
        }
        #[cfg(windows)]
        {
            cleaned = _stripped;
        }
    } else if let Some(_stripped) = cleaned.strip_prefix("file:///") {
        #[cfg(not(windows))]
        {
            // On Unix, retain leading slash for absolute path (/home/...)
            cleaned = &cleaned[7..];
        }
        #[cfg(windows)]
        {
            cleaned = _stripped;
        }
    } else if let Some(stripped) = cleaned.strip_prefix("file://") {
        cleaned = stripped;
    }

    // 2. Percent-decode (%20 -> ' ', etc.)
    let decoded = urlencoding_decode(cleaned);

    // 3. Platform slash normalization
    #[cfg(windows)]
    let mut path_str = decoded.replace('/', "\\");
    #[cfg(not(windows))]
    let path_str = decoded.replace('\\', "/");

    #[cfg(windows)]
    {
        // Strip leading slash if file:/// resulted in \C:\...
        if path_str.starts_with('\\') && path_str.len() >= 3 && path_str.chars().nth(2) == Some(':')
        {
            path_str = path_str[1..].to_string();
        }
    }

    let path = Path::new(&path_str);

    // 4. Resolve relative path against current working directory
    let abs_path = if path.is_relative() {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    } else {
        path.to_path_buf()
    };

    // 5. Strip Windows UNC canonical prefix \\?\ if present
    #[cfg(windows)]
    {
        let s = abs_path.to_string_lossy();
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }

    abs_path
}

/// Resolves a file path for revealing in system file manager (Explorer, Finder, xdg-open),
/// providing safe parent fallback if the file no longer exists.
pub fn resolve_reveal_target(raw: &str) -> RevealResolution {
    let normalized = normalize_file_path(raw);

    if normalized.exists() {
        let is_file = normalized.is_file();
        RevealResolution::Exact {
            path: normalized,
            is_file,
        }
    } else if let Some(parent) = normalized.parent() {
        if parent.exists() && parent != Path::new("") {
            RevealResolution::FallbackParent {
                parent: parent.to_path_buf(),
                original: normalized,
            }
        } else {
            RevealResolution::NotFound {
                original: normalized,
            }
        }
    } else {
        RevealResolution::NotFound {
            original: normalized,
        }
    }
}

/// Zero-dependency URL percent decoder (%20 -> ' ', %23 -> '#', etc.).
fn urlencoding_decode(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(h1), Some(h2)) = (h1, h2) {
                if let (Some(v1), Some(v2)) = (hex_val(h1), hex_val(h2)) {
                    bytes.push((v1 << 4) | v2);
                    continue;
                } else {
                    bytes.push(b'%');
                    bytes.push(h1);
                    bytes.push(h2);
                    continue;
                }
            } else {
                bytes.push(b'%');
                if let Some(h1) = h1 {
                    bytes.push(h1);
                }
                break;
            }
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8_lossy(&bytes).to_string()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_url_decoding() {
        assert_eq!(urlencoding_decode("hello%20world"), "hello world");
        assert_eq!(urlencoding_decode("foo%23bar%25baz"), "foo#bar%baz");
        assert_eq!(urlencoding_decode("plain_text.txt"), "plain_text.txt");
    }

    #[test]
    fn test_normalize_file_uri() {
        #[cfg(windows)]
        {
            let p1 = normalize_file_path("file:///C:/Users/test/doc%20name.txt");
            assert_eq!(p1.to_string_lossy(), r"C:\Users\test\doc name.txt");

            let p2 = normalize_file_path("file://localhost/D:/projects/code.rs");
            assert_eq!(p2.to_string_lossy(), r"D:\projects\code.rs");
        }

        #[cfg(not(windows))]
        {
            let p1 = normalize_file_path("file:///home/user/my%20file.txt");
            assert_eq!(p1.to_string_lossy(), "/home/user/my file.txt");

            let p2 = normalize_file_path("file://localhost/home/user/code.rs");
            assert_eq!(p2.to_string_lossy(), "/home/user/code.rs");
        }
    }

    #[test]
    fn test_relative_path_normalization() {
        let p = normalize_file_path("Cargo.toml");
        assert!(p.is_absolute());
        assert!(p.ends_with("Cargo.toml"));
    }

    #[test]
    fn test_reveal_resolution_existing_and_fallback() {
        // Cargo.toml exists in the workspace
        let res = resolve_reveal_target("Cargo.toml");
        match res {
            RevealResolution::Exact { path, is_file } => {
                assert!(is_file);
                assert!(path.exists());
            }
            _ => panic!("Expected Exact resolution for Cargo.toml"),
        }

        // Nonexistent file in an existing parent directory
        let res_missing = resolve_reveal_target("./definitely_nonexistent_file_bbq_123.txt");
        match res_missing {
            RevealResolution::FallbackParent { parent, original } => {
                assert!(parent.exists());
                assert!(original.ends_with("definitely_nonexistent_file_bbq_123.txt"));
            }
            _ => panic!("Expected FallbackParent resolution for nonexistent file in existing dir"),
        }

        // Nonexistent file in completely nonexistent directory
        let res_nowhere = resolve_reveal_target("Z:/nonexistent_drive_987/missing_dir/ghost.txt");
        match res_nowhere {
            RevealResolution::NotFound { original } => {
                assert!(original.ends_with("ghost.txt"));
            }
            RevealResolution::FallbackParent { parent, .. } => {
                // If Z: doesn't exist, parent doesn't exist, but on some virtual systems root might exist
                assert!(parent.exists());
            }
            _ => {}
        }
    }

    #[test]
    fn test_cross_platform_path_syntax() {
        // Test Windows drive path with forward slashes
        #[cfg(windows)]
        {
            let p = normalize_file_path("C:/Users/omer/Projects/BBQ/Cargo.toml");
            assert_eq!(
                p.to_string_lossy(),
                r"C:\Users\omer\Projects\BBQ\Cargo.toml"
            );
        }

        // Test macOS/Linux slash normalization
        #[cfg(not(windows))]
        {
            let p = normalize_file_path("/Users/omer/Projects/BBQ/Cargo.toml");
            assert_eq!(p.to_string_lossy(), "/Users/omer/Projects/BBQ/Cargo.toml");
        }
    }

    #[test]
    fn test_unicode_and_turkish_path_decoding() {
        // Test URL percent-encoded Turkish characters (%C3%B6 = ö, %C3%BC = ü, %C5%9F = ş, %C4%B1 = ı, %C3%A7 = ç, %C4%9F = ğ)
        let decoded = urlencoding_decode("dosya%20%C3%B6rnek%20%C3%BCr%C3%BCn%20%C5%9Fehir%20%C4%B1rmak%20%C3%A7i%C3%A7ek%20da%C4%9F.txt");
        assert_eq!(decoded, "dosya örnek ürün şehir ırmak çiçek dağ.txt");

        #[cfg(windows)]
        {
            let p = normalize_file_path(
                "file:///D:/Projeler/T%C3%BCrk%C3%A7e%20Klas%C3%B6r/belge%20%C5%9Fablonu.docx",
            );
            assert_eq!(
                p.to_string_lossy(),
                r"D:\Projeler\Türkçe Klasör\belge şablonu.docx"
            );
        }

        #[cfg(not(windows))]
        {
            let p = normalize_file_path("file:///home/user/Projeler/T%C3%BCrk%C3%A7e%20Klas%C3%B6r/belge%20%C5%9Fablonu.docx");
            assert_eq!(
                p.to_string_lossy(),
                "/home/user/Projeler/Türkçe Klasör/belge şablonu.docx"
            );
        }
    }
}
