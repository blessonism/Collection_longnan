"""
数据库迁移脚本：自动检测并添加缺失的数据库字段
"""
import sqlite3
import os


def get_db_path():
    """获取数据库文件路径"""
    db_url = os.environ.get('DATABASE_URL', 'sqlite+aiosqlite:///./data/weekly_summary.db')
    if 'sqlite' in db_url:
        return db_url.split(':///')[-1]
    return './data/weekly_summary.db'


def get_table_columns(cursor, table_name):
    """获取表的所有列名"""
    cursor.execute(f"PRAGMA table_info({table_name})")
    return [col[1] for col in cursor.fetchall()]


def add_column_if_not_exists(cursor, table_name, column_name, column_type):
    """如果列不存在则添加"""
    columns = get_table_columns(cursor, table_name)
    if column_name not in columns:
        print(f"  Adding column: {table_name}.{column_name}")
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
        return True
    return False


def migrate():
    """执行所有迁移"""
    db_file = get_db_path()
    print(f"[Migration] Database: {db_file}")
    
    if not os.path.exists(db_file):
        print("[Migration] Database file not found, will be created on first run.")
        return
    
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    
    changes = 0
    
    # 迁移 1: daily_reports 表添加 original_content 字段
    if add_column_if_not_exists(cursor, 'daily_reports', 'original_content', 'TEXT'):
        changes += 1
    
    # 在这里添加更多迁移...
    # 例如: add_column_if_not_exists(cursor, 'some_table', 'new_column', 'TEXT')
    
    if changes > 0:
        conn.commit()
        print(f"[Migration] Completed: {changes} change(s) applied.")
    else:
        print("[Migration] No changes needed.")
    
    conn.close()


if __name__ == "__main__":
    migrate()
