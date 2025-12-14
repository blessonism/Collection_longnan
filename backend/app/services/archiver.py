from __future__ import annotations
import zipfile
from io import BytesIO
from typing import List
from app.models.submission import Submission
from app.services.exporter import export_to_word

def create_archive(submissions: List[Submission], naming_template: str, start_number: int = 1, number_padding: int = 2) -> tuple[bytes, list[dict]]:
    """
    批量归档周小结
    返回: (zip文件内容, 文件清单)
    """
    buffer = BytesIO()
    manifest = []
    
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for i, sub in enumerate(submissions):
            seq = str(start_number + i).zfill(number_padding)
            
            # 根据模板生成文件名
            filename = naming_template.format(
                序号=seq,
                姓名=sub.name,
                日期范围=sub.date_range
            )
            if not filename.endswith('.docx'):
                filename += '.docx'
            
            # 生成 Word 文档
            doc_bytes = export_to_word(
                name=sub.name,
                date_range=sub.date_range,
                weekly_work=sub.weekly_work,
                next_week_plan=sub.next_week_plan
            )
            
            zf.writestr(filename, doc_bytes)
            manifest.append({
                "序号": seq,
                "文件名": filename,
                "姓名": sub.name,
                "日期范围": sub.date_range
            })
    
    buffer.seek(0)
    return buffer.getvalue(), manifest

def generate_manifest_text(manifest: list[dict], date_range: str) -> str:
    """生成文件清单文本"""
    lines = [
        "周小结文件清单",
        f"日期范围：{date_range}",
        "",
        "序号  文件名                                    姓名",
        "─" * 60
    ]
    
    for item in manifest:
        lines.append(f"{item['序号']}    {item['文件名']:<40} {item['姓名']}")
    
    lines.append("─" * 60)
    lines.append(f"共计：{len(manifest)} 份")
    
    return "\n".join(lines)
