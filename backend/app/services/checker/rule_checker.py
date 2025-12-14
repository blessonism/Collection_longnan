"""
基于规则的校对器 - 处理明确的格式和标点规则
不需要 AI，用代码逻辑直接检测
支持从数据库加载配置
"""
import re
from app.schemas import CheckIssue
from app.services.checker.config_loader import get_rule_config, DEFAULT_RULE_CONFIG


class RuleChecker:
    """规则校对器"""

    async def check(self, content: str) -> list[CheckIssue]:
        """执行所有规则检查"""
        # 加载配置
        config = await get_rule_config()
        
        issues = []
        lines = content.split('\n')
        current_section = ""
        item_index = 0

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if "本周工作" in line:
                current_section = "本周工作"
                item_index = 0
                continue
            elif "下周计划" in line:
                current_section = "下周计划"
                item_index = 0
                continue

            if re.match(r'^\d', line):
                item_index += 1
                location = f"{current_section}第{item_index}条" if current_section else f"第{item_index}条"
                issues.extend(self._check_line(line, location, config))

        return issues

    def _check_line(self, line: str, location: str, config: dict) -> list[CheckIssue]:
        """检查单行内容"""
        issues = []

        if config.get("check_number_format", True):
            issues.extend(self._check_number_format(line, location))

        if config.get("check_extra_spaces", True):
            issues.extend(self._check_extra_spaces(line, location))

        if config.get("check_english_punctuation", True):
            issues.extend(self._check_english_punctuation(line, location))

        if config.get("check_slash_to_semicolon", True):
            issues.extend(self._check_slash(line, location))

        if config.get("check_consecutive_punctuation", True):
            issues.extend(self._check_consecutive_punctuation(line, location))

        if config.get("check_english_brackets", True):
            issues.extend(self._check_english_brackets(line, location))

        if config.get("check_ending_punctuation", True):
            issues.extend(self._check_ending_punctuation(line, location))

        return issues

    def _check_number_format(self, line: str, location: str) -> list[CheckIssue]:
        """检查序号格式：必须是 1. 2. 3. 格式"""
        issues = []

        match = re.match(r'^(\d+)、', line)
        if match:
            issues.append(CheckIssue(
                type="format",
                severity="error",
                location=location,
                context=line[:20] + "..." if len(line) > 20 else line,
                original=f"{match.group(1)}、",
                suggestion=f"{match.group(1)}."
            ))
            return issues

        match = re.match(r'^(\d+)。', line)
        if match:
            issues.append(CheckIssue(
                type="format",
                severity="error",
                location=location,
                context=line[:20] + "..." if len(line) > 20 else line,
                original=f"{match.group(1)}。",
                suggestion=f"{match.group(1)}."
            ))
            return issues

        match = re.match(r'^(\d+)\.\s+', line)
        if match:
            issues.append(CheckIssue(
                type="format",
                severity="error",
                location=location,
                context=line[:25] + "..." if len(line) > 25 else line,
                original=match.group(0),
                suggestion=f"{match.group(1)}."
            ))

        return issues

    def _check_extra_spaces(self, line: str, location: str) -> list[CheckIssue]:
        """检查多余空格"""
        issues = []
        pattern = r'([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5：；，。、])'
        matches = list(re.finditer(pattern, line))

        for match in matches:
            start = max(0, match.start() - 5)
            end = min(len(line), match.end() + 5)
            context = line[start:end]
            issues.append(CheckIssue(
                type="format",
                severity="warning",
                location=location,
                context=context,
                original=match.group(0),
                suggestion=match.group(1) + match.group(2)
            ))

        return issues

    def _check_english_punctuation(self, line: str, location: str) -> list[CheckIssue]:
        """检查英文标点"""
        issues = []
        punctuation_map = [
            (',', '，'),
            (';', '；'),
            ('?', '？'),
            ('!', '！'),
        ]

        for eng, chn in punctuation_map:
            for match in re.finditer(re.escape(eng), line):
                start = max(0, match.start() - 5)
                end = min(len(line), match.end() + 5)
                context = line[start:end]
                issues.append(CheckIssue(
                    type="punctuation",
                    severity="error",
                    location=location,
                    context=context,
                    original=eng,
                    suggestion=chn
                ))

        # 英文冒号（排除时间格式）
        for match in re.finditer(r':', line):
            pos = match.start()
            if pos > 0 and pos < len(line) - 1:
                before = line[pos - 1] if pos > 0 else ''
                after = line[pos + 1] if pos < len(line) - 1 else ''
                if before.isdigit() and after.isdigit():
                    continue
            start = max(0, match.start() - 5)
            end = min(len(line), match.end() + 5)
            context = line[start:end]
            issues.append(CheckIssue(
                type="punctuation",
                severity="error",
                location=location,
                context=context,
                original=":",
                suggestion="："
            ))

        return issues

    def _check_slash(self, line: str, location: str) -> list[CheckIssue]:
        """检查斜杠（中文语境中应为分号）"""
        issues = []
        for match in re.finditer(r'[\u4e00-\u9fa5]/[\u4e00-\u9fa5]', line):
            start = max(0, match.start() - 3)
            end = min(len(line), match.end() + 3)
            context = line[start:end]
            issues.append(CheckIssue(
                type="punctuation",
                severity="error",
                location=location,
                context=context,
                original="/",
                suggestion="；"
            ))
        return issues

    def _check_consecutive_punctuation(self, line: str, location: str) -> list[CheckIssue]:
        """检查连续重复标点"""
        issues = []
        for match in re.finditer(r'([，。；：、])\1+', line):
            start = max(0, match.start() - 3)
            end = min(len(line), match.end() + 3)
            context = line[start:end]
            issues.append(CheckIssue(
                type="punctuation",
                severity="error",
                location=location,
                context=context,
                original=match.group(0),
                suggestion=match.group(1)
            ))
        return issues

    def _check_english_brackets(self, line: str, location: str) -> list[CheckIssue]:
        """检查英文括号（括号内有中文时）"""
        issues = []
        for match in re.finditer(r'\(', line):
            pos = match.start()
            close_pos = line.find(')', pos)
            if close_pos > pos:
                inner = line[pos + 1:close_pos]
                if re.search(r'[\u4e00-\u9fa5]', inner):
                    start = max(0, pos - 3)
                    end = min(len(line), close_pos + 4)
                    context = line[start:end]
                    issues.append(CheckIssue(
                        type="punctuation",
                        severity="error",
                        location=location,
                        context=context,
                        original="(",
                        suggestion="（"
                    ))

        for match in re.finditer(r'\)', line):
            pos = match.start()
            open_pos = line.rfind('(', 0, pos)
            if open_pos >= 0:
                inner = line[open_pos + 1:pos]
                if re.search(r'[\u4e00-\u9fa5]', inner):
                    start = max(0, pos - 3)
                    end = min(len(line), pos + 4)
                    context = line[start:end]
                    issues.append(CheckIssue(
                        type="punctuation",
                        severity="error",
                        location=location,
                        context=context,
                        original=")",
                        suggestion="）"
                    ))
        return issues

    def _check_ending_punctuation(self, line: str, location: str) -> list[CheckIssue]:
        """检查句末标点：每条必须以句号结尾"""
        issues = []
        if not line:
            return issues

        # 排除纯序号行（如 "1."）
        if re.match(r'^\d+\.$', line):
            return issues

        last_char = line[-1]

        # 以分号结尾，应改为句号
        if last_char == '；':
            context = line[-15:] if len(line) > 15 else line
            issues.append(CheckIssue(
                type="punctuation",
                severity="error",
                location=location,
                context=context,
                original="；",
                suggestion="。"
            ))
        # 以英文句号结尾，应改为中文句号
        elif last_char == '.':
            context = line[-15:] if len(line) > 15 else line
            issues.append(CheckIssue(
                type="punctuation",
                severity="error",
                location=location,
                context=context,
                original=".",
                suggestion="。"
            ))
        # 末尾不是句号（也不是其他合理结尾），提醒添加句号
        elif last_char != '。' and last_char not in '？！）':
            context = line[-15:] if len(line) > 15 else line
            issues.append(CheckIssue(
                type="punctuation",
                severity="error",
                location=location,
                context=context,
                original=last_char,
                suggestion=last_char + "。"
            ))

        return issues


rule_checker = RuleChecker()
