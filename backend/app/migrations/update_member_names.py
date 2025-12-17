"""
迁移脚本：将人员名字从显示名格式更新为全名格式
例如：志明同志 → 陈志明

运行方式：
cd backend
python -c "from app.migrations.update_member_names import migrate; migrate()"
"""

import sqlite3
import os

# 名字映射：旧名字 → 新全名
NAME_MAPPING = {
    "志明同志": "陈志明",
    "锋军同志": "赖锋军",
    "彭鸿同志": "彭鸿",
    "立龙同志": "谢立龙",
    "颖娴同志": "廖颖娴",
    "智超同志": "张智超",
    "兵兵同志": "宋兵兵",
    "显旺同志": "叶显旺",
    "春英同志": "赖春英",
    "桂梅同志": "欧桂梅",
}


def migrate():
    # 确定数据库路径
    db_paths = [
        "/app/data/weekly_summary.db",  # Docker 环境
        "data/weekly_summary.db",        # 本地环境
    ]
    
    db_path = None
    for path in db_paths:
        if os.path.exists(path):
            db_path = path
            break
    
    if not db_path:
        print("❌ 找不到数据库文件")
        return
    
    print(f"📂 使用数据库: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 查看当前人员列表
    cursor.execute("SELECT id, name FROM daily_members ORDER BY sort_order, id")
    members = cursor.fetchall()
    
    print(f"\n📋 当前人员列表 ({len(members)} 人):")
    for member_id, name in members:
        cursor.execute("SELECT COUNT(*) FROM daily_reports WHERE member_id = ?", (member_id,))
        report_count = cursor.fetchone()[0]
        print(f"  {member_id}: {name} ({report_count} 条动态)")
    
    # 更新名字
    updated = 0
    print("\n🔄 更新名字...")
    
    for old_name, new_name in NAME_MAPPING.items():
        cursor.execute(
            "UPDATE daily_members SET name = ? WHERE name = ?",
            (new_name, old_name)
        )
        if cursor.rowcount > 0:
            print(f"  ✅ {old_name} → {new_name}")
            updated += cursor.rowcount
    
    conn.commit()
    
    # 显示更新后的列表
    cursor.execute("SELECT id, name FROM daily_members ORDER BY sort_order, id")
    members = cursor.fetchall()
    
    print(f"\n📋 更新后人员列表 ({len(members)} 人):")
    for member_id, name in members:
        cursor.execute("SELECT COUNT(*) FROM daily_reports WHERE member_id = ?", (member_id,))
        report_count = cursor.fetchone()[0]
        print(f"  {member_id}: {name} ({report_count} 条动态)")
    
    print(f"\n✅ 迁移完成！更新 {updated} 人")
    
    conn.close()


if __name__ == "__main__":
    migrate()
