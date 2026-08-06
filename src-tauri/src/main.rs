// Windows'ta release derlemede konsol penceresi acilmasin.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kokpit_lib::run()
}
