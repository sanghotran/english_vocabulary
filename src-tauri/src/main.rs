// Prevents additional console window on Windows in release, do not remove.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use rusqlite::{Connection, OptionalExtension};

struct DbState {
    db_path: PathBuf,
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
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    let mut rel_stmt = conn.prepare("SELECT word FROM related_words WHERE vocabulary_id = ?1").map_err(|e| e.to_string())?;
    
    for row in rows {
        let mut vocab = row.map_err(|e| e.to_string())?;
        let rel_rows = rel_stmt.query_map([vocab.id.unwrap()], |r| r.get(0)).map_err(|e| e.to_string())?;
        let mut rels = Vec::new();
        for r in rel_rows {
            rels.push(r.map_err(|e| e.to_string())?);
        }
        vocab.related_words = rels;
        list.push(vocab);
    }
    Ok(list)
}

#[tauri::command]
fn due_vocab(state: tauri::State<'_, DbState>) -> Result<Vec<Vocabulary>, String> {
    let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, main_word, ipa, translation, example_sentence_vi, example_sentence_en, created_at, interval, ease_factor, repetitions, next_review 
         FROM vocabularies WHERE next_review <= datetime('now', 'localtime') ORDER BY next_review ASC"
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
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    let mut rel_stmt = conn.prepare("SELECT word FROM related_words WHERE vocabulary_id = ?1").map_err(|e| e.to_string())?;
    
    for row in rows {
        let mut vocab = row.map_err(|e| e.to_string())?;
        let rel_rows = rel_stmt.query_map([vocab.id.unwrap()], |r| r.get(0)).map_err(|e| e.to_string())?;
        let mut rels = Vec::new();
        for r in rel_rows {
            rels.push(r.map_err(|e| e.to_string())?);
        }
        vocab.related_words = rels;
        list.push(vocab);
    }
    Ok(list)
}

#[tauri::command]
fn save_vocab(state: tauri::State<'_, DbState>, vocab: Vocabulary) -> Result<SaveResponse, String> {
    let mut conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    let vocab_id = match vocab.id {
        Some(id) => {
            tx.execute(
                "UPDATE vocabularies SET main_word=?1, ipa=?2, translation=?3, example_sentence_vi=?4, example_sentence_en=?5 WHERE id=?6",
                (vocab.main_word, vocab.ipa, vocab.translation, vocab.example_sentence_vi, vocab.example_sentence_en, id)
            ).map_err(|e| e.to_string())?;
            id
        },
        None => {
            tx.execute(
                "INSERT INTO vocabularies (main_word, ipa, translation, example_sentence_vi, example_sentence_en) VALUES (?1, ?2, ?3, ?4, ?5)",
                (vocab.main_word, vocab.ipa, vocab.translation, vocab.example_sentence_vi, vocab.example_sentence_en)
            ).map_err(|e| e.to_string())?;
            tx.last_insert_rowid()
        }
    };

    tx.execute("DELETE FROM related_words WHERE vocabulary_id=?1", [vocab_id]).map_err(|e| e.to_string())?;
    for word in vocab.related_words {
        let word_trimmed = word.trim();
        if !word_trimmed.is_empty() {
            tx.execute("INSERT INTO related_words (vocabulary_id, word) VALUES (?1, ?2)", (vocab_id, word_trimmed)).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
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
        "UPDATE vocabularies SET interval = ?1, ease_factor = ?2, repetitions = ?3, next_review = ?4 WHERE id = ?5",
        (interval, ease_factor, repetitions, next_review, id)
    ).map_err(|e| e.to_string())?;
    Ok(true)
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

// --- MAIN RUNNER ---

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Get local app data folder path
            let app_dir = app.path().app_data_dir().expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir).unwrap();
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
                    word TEXT NOT NULL
                );",
                [],
            )?;

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
            call_groq
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
