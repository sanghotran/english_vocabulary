// Prevents additional console window on Windows in release, do not remove.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use tauri::Manager;
use rusqlite::{Connection, OptionalExtension};

struct DbState {
    db_path: PathBuf,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct RelatedWordDetail {
    id: i64,
    word: String,
    interval: i64,
    ease_factor: f64,
    repetitions: i64,
    next_review: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct ReviewCard {
    id: i64,
    vocabulary_id: i64,
    word: String,
    interval: i64,
    ease_factor: f64,
    repetitions: i64,
    next_review: String,
    main_word: String,
    ipa: Option<String>,
    translation: String,
    example_sentence_vi: Option<String>,
    example_sentence_en: Option<String>,
    related_words: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct Vocabulary {
    id: Option<i64>,
    main_word: String,
    ipa: Option<String>,
    translation: String,
    example_sentence_vi: Option<String>,
    example_sentence_en: Option<String>,
    created_at: Option<String>,
    interval: Option<i64>,
    ease_factor: Option<f64>,
    repetitions: Option<i64>,
    next_review: Option<String>,
    related_words: Vec<String>,
    related_details: Option<Vec<RelatedWordDetail>>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct SaveResponse {
    success: bool,
    id: Option<i64>,
    error: Option<String>,
}

// --- COMMANDS ---

#[tauri::command]
fn get_setting(state: tauri::State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1").map_err(|e| e.to_string())?;
    let val: Option<String> = stmt.query_row([key], |row| row.get(0)).optional().map_err(|e| e.to_string())?;
    Ok(val)
}

#[tauri::command]
fn set_setting(state: tauri::State<'_, DbState>, key: String, value: String) -> Result<(), String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        [key, value],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_vocab(state: tauri::State<'_, DbState>) -> Result<Vec<Vocabulary>, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, main_word, ipa, translation, example_sentence_vi, example_sentence_en, created_at, interval, ease_factor, repetitions, next_review 
         FROM vocabularies ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(Vocabulary {
            id: Some(row.get(0)?),
            main_word: row.get(1)?,
            ipa: row.get(2)?,
            translation: row.get(3)?,
            example_sentence_vi: row.get(4)?,
            example_sentence_en: row.get(5)?,
            created_at: Some(row.get(6)?),
            interval: Some(row.get(7)?),
            ease_factor: Some(row.get(8)?),
            repetitions: Some(row.get(9)?),
            next_review: Some(row.get(10)?),
            related_words: Vec::new(),
            related_details: None,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    let mut rel_stmt = conn.prepare(
        "SELECT id, word, interval, ease_factor, repetitions, next_review 
         FROM related_words WHERE vocabulary_id = ?1"
    ).map_err(|e| e.to_string())?;
    
    for row in rows {
        let mut vocab = row.map_err(|e| e.to_string())?;
        let rel_rows = rel_stmt.query_map([vocab.id.unwrap()], |r| {
            Ok(RelatedWordDetail {
                id: r.get(0)?,
                word: r.get(1)?,
                interval: r.get(2)?,
                ease_factor: r.get(3)?,
                repetitions: r.get(4)?,
                next_review: r.get(5)?,
            })
        }).map_err(|e| e.to_string())?;
        
        let mut rels = Vec::new();
        let mut details = Vec::new();
        for r in rel_rows {
            let detail = r.map_err(|e| e.to_string())?;
            rels.push(detail.word.clone());
            details.push(detail);
        }
        vocab.related_words = rels;
        vocab.related_details = Some(details);
        list.push(vocab);
    }
    Ok(list)
}

#[tauri::command]
fn due_vocab(state: tauri::State<'_, DbState>) -> Result<Vec<ReviewCard>, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT r.id, r.vocabulary_id, r.word, r.interval, r.ease_factor, r.repetitions, r.next_review,
                v.main_word, v.ipa, v.translation, v.example_sentence_vi, v.example_sentence_en
         FROM related_words r
         JOIN vocabularies v ON r.vocabulary_id = v.id
         WHERE r.next_review <= datetime('now', 'localtime')
         ORDER BY r.next_review ASC"
    ).map_err(|e| e.to_string())?;
    
    let card_rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, f64>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, Option<String>>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, Option<String>>(10)?,
            row.get::<_, Option<String>>(11)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut cards = Vec::new();
    let mut rel_stmt = conn.prepare("SELECT word FROM related_words WHERE vocabulary_id = ?1").map_err(|e| e.to_string())?;
    
    for row in card_rows {
        let (id, vocab_id, word, interval, ease_factor, repetitions, next_review, main_word, ipa, translation, example_sentence_vi, example_sentence_en) = row.map_err(|e| e.to_string())?;
        
        let rel_rows = rel_stmt.query_map([vocab_id], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        let mut related_words = Vec::new();
        for r in rel_rows {
            related_words.push(r.map_err(|e| e.to_string())?);
        }
        
        cards.push(ReviewCard {
            id,
            vocabulary_id: vocab_id,
            word,
            interval,
            ease_factor,
            repetitions,
            next_review,
            main_word,
            ipa,
            translation,
            example_sentence_vi,
            example_sentence_en,
            related_words,
        });
    }
    Ok(cards)
}

#[tauri::command]
fn save_vocab(state: tauri::State<'_, DbState>, vocab: Vocabulary) -> Result<SaveResponse, String> {
    let mut conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    let vocab_id = match vocab.id {
        Some(id) => {
            if let Err(e) = tx.execute(
                "UPDATE vocabularies SET main_word=?1, ipa=?2, translation=?3, example_sentence_vi=?4, example_sentence_en=?5 WHERE id=?6",
                (vocab.main_word.clone(), vocab.ipa, vocab.translation, vocab.example_sentence_vi, vocab.example_sentence_en, id)
            ) {
                return Ok(SaveResponse { success: false, id: None, error: Some(format!("Database error: {}", e)) });
            }
            id
        },
        None => {
            match tx.execute(
                "INSERT INTO vocabularies (main_word, ipa, translation, example_sentence_vi, example_sentence_en) VALUES (?1, ?2, ?3, ?4, ?5)",
                (vocab.main_word.clone(), vocab.ipa, vocab.translation, vocab.example_sentence_vi, vocab.example_sentence_en)
            ) {
                Ok(_) => tx.last_insert_rowid(),
                Err(e) => {
                    return Ok(SaveResponse { success: false, id: None, error: Some(format!("Database error: {}", e)) });
                }
            }
        }
    };

    let mut new_related_words = Vec::new();
    for r in vocab.related_words {
        let trimmed = r.trim().to_string();
        if !trimmed.is_empty() {
            new_related_words.push(trimmed);
        }
    }
    if new_related_words.is_empty() {
        new_related_words.push(vocab.main_word.trim().to_string());
    }

    let mut existing_map = std::collections::HashMap::new();
    {
        let mut existing_stmt = match tx.prepare("SELECT id, word FROM related_words WHERE vocabulary_id = ?1") {
            Ok(s) => s,
            Err(e) => return Ok(SaveResponse { success: false, id: None, error: Some(format!("Database error: {}", e)) })
        };
        let existing_rows = match existing_stmt.query_map([vocab_id], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
        }) {
            Ok(rows) => rows,
            Err(e) => return Ok(SaveResponse { success: false, id: None, error: Some(format!("Database error: {}", e)) })
        };
        for row in existing_rows {
            if let Ok((id, word)) = row {
                existing_map.insert(word, id);
            }
        }
    }

    for word in &new_related_words {
        if !existing_map.contains_key(word) {
            if let Err(e) = tx.execute(
                "INSERT INTO related_words (vocabulary_id, word, interval, ease_factor, repetitions, next_review) 
                 VALUES (?1, ?2, 1, 2.5, 0, datetime('now', 'localtime'))",
                (vocab_id, word)
            ) {
                return Ok(SaveResponse { success: false, id: None, error: Some(format!("Database error: {}", e)) });
            }
        } else {
            existing_map.remove(word);
        }
    }

    for (_, id) in existing_map {
        if let Err(e) = tx.execute("DELETE FROM related_words WHERE id = ?1", [id]) {
            return Ok(SaveResponse { success: false, id: None, error: Some(format!("Database error: {}", e)) });
        }
    }

    if let Err(e) = tx.commit() {
        return Ok(SaveResponse { success: false, id: None, error: Some(format!("Database error: {}", e)) });
    }

    Ok(SaveResponse { success: true, id: Some(vocab_id), error: None })
}

#[tauri::command]
fn delete_vocab(state: tauri::State<'_, DbState>, id: i64) -> Result<bool, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM vocabularies WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn update_review(
    state: tauri::State<'_, DbState>,
    id: i64,
    interval: i64,
    ease_factor: f64,
    repetitions: i64,
    next_review: String
) -> Result<bool, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE related_words SET interval = ?1, ease_factor = ?2, repetitions = ?3, next_review = ?4 WHERE id = ?5",
        (interval, ease_factor, repetitions, next_review, id)
    ).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn get_db_path(state: tauri::State<'_, DbState>) -> String {
    state.db_path.to_string_lossy().into_owned()
}

#[tauri::command]
async fn call_groq(
    api_key: String,
    model: String,
    messages: serde_json::Value,
    response_format: Option<serde_json::Value>
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages
    });
    
    if let Some(rf) = response_format {
        if let Some(map) = body.as_object_mut() {
            map.insert("response_format".to_string(), rf);
        }
    }

    let res = client.post("https://api.groq.com/openai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Groq API status error: {}", err_text));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn get_groq_models(api_key: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let res = client.get("https://api.groq.com/openai/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Groq API status error: {}", err_text));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

// --- MAIN RUNNER ---

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Get directory of the running executable
            let exe_path = std::env::current_exe()?;
            let app_dir = exe_path.parent().ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotFound, "Failed to get executable directory")
            })?;
            let db_path = app_dir.join("database.db");
            println!("SQLite Database Path: {:?}", db_path);

            // Initialize DB
            let conn = Connection::open(&db_path)?;
            conn.execute("PRAGMA foreign_keys = ON;", [])?;

            conn.execute(
                "CREATE TABLE IF NOT EXISTS vocabularies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    main_word TEXT UNIQUE NOT NULL,
                    ipa TEXT,
                    translation TEXT NOT NULL,
                    example_sentence_vi TEXT,
                    example_sentence_en TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    interval INTEGER DEFAULT 1,
                    ease_factor REAL DEFAULT 2.5,
                    repetitions INTEGER DEFAULT 0,
                    next_review DATETIME DEFAULT CURRENT_TIMESTAMP
                );",
                [],
            )?;

            conn.execute(
                "CREATE TABLE IF NOT EXISTS related_words (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vocabulary_id INTEGER REFERENCES vocabularies(id) ON DELETE CASCADE,
                    word TEXT NOT NULL,
                    interval INTEGER DEFAULT 1,
                    ease_factor REAL DEFAULT 2.5,
                    repetitions INTEGER DEFAULT 0,
                    next_review DATETIME DEFAULT (datetime('now', 'localtime'))
                );",
                [],
            )?;

            // Run migrations for existing DBs
            let _ = conn.execute("ALTER TABLE related_words ADD COLUMN interval INTEGER DEFAULT 1;", []);
            let _ = conn.execute("ALTER TABLE related_words ADD COLUMN ease_factor REAL DEFAULT 2.5;", []);
            let _ = conn.execute("ALTER TABLE related_words ADD COLUMN repetitions INTEGER DEFAULT 0;", []);
            let _ = conn.execute("ALTER TABLE related_words ADD COLUMN next_review DATETIME DEFAULT (datetime('now', 'localtime'));", []);

            conn.execute(
                "CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );",
                [],
            )?;

            // Manage database path state
            app.manage(DbState { db_path });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_setting,
            set_setting,
            list_vocab,
            due_vocab,
            save_vocab,
            delete_vocab,
            update_review,
            call_groq,
            get_groq_models,
            get_db_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
