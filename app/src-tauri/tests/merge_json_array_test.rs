use sendpalm_app_lib::services::db::merge_json_array;

#[test]
fn merge_dedups_repeated() {
    let r = merge_json_array(r#"["a","b"]"#, r#"["b","c"]"#).unwrap();
    assert_eq!(r, r#"["a","b","c"]"#);
}

#[test]
fn merge_caps_at_256() {
    let existing =
        serde_json::to_string(&(0..200).map(|i| format!("m{i}")).collect::<Vec<_>>()).unwrap();
    let added =
        serde_json::to_string(&(200..400).map(|i| format!("m{i}")).collect::<Vec<_>>()).unwrap();
    let r = merge_json_array(&existing, &added).unwrap();
    let v: Vec<String> = serde_json::from_str(&r).unwrap();
    assert_eq!(v.len(), 256);
    assert!(v.contains(&"m399".to_string()));
}

#[test]
fn merge_handles_empty_added() {
    let r = merge_json_array(r#"["a"]"#, "[]").unwrap();
    assert_eq!(r, r#"["a"]"#);
}

#[test]
fn merge_rejects_malformed() {
    assert!(merge_json_array("not-json", "[]").is_err());
    assert!(merge_json_array("[]", "not-json").is_err());
}
