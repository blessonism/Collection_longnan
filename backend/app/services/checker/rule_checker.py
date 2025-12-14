"""
基于规则的校对器 - 处理明确的格式和标点规则
不需要 AI，用代码逻辑直接检测
支持从数据库加载配置
"""
from __future__ import annotations
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
        line_index_in_section = 0  # 当前区块内的行号
        last_number = 0  # 上一个序号，用于检测序号跳跃

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if "本周工作" in line:
                current_section = "本周工作"
                item_index = 0
                line_index_in_section = 0
                last_number = 0
                continue
            elif "下周计划" in line:
                current_section = "下周计划"
                item_index = 0
                line_index_in_section = 0
                last_number = 0
                continue

            # 在区块内的内容行
            if current_section:
                line_index_in_section += 1
            
            if re.match(r'^\d', line):
                item_index += 1
                location = f"{current_section}第{item_index}条" if current_section else f"第{item_index}条"
                issues.extend(self._check_line(line, location, config))
                
                # 检查序号连续性
                if config.get("check_number_sequence", True):
                    number_match = re.match(r'^(\d+)[.、。]', line)
                    if number_match:
                        current_number = int(number_match.group(1))
                        expected = last_number + 1
                        if last_number > 0 and current_number != expected:
                            issues.append(CheckIssue(
                                type="format",
                                severity="error",
                                location=location,
                                context=line[:30] + "..." if len(line) > 30 else line,
                                original=f"{current_number}.",
                                suggestion=f"{expected}."
                            ))
                        # 始终递增期望序号，不管实际序号是多少
                        last_number += 1
            elif current_section and config.get("check_missing_number", True):
                # 非空行但不以数字开头，提示缺少序号
                location = f"{current_section}第{line_index_in_section}行"
                issues.append(CheckIssue(
                    type="format",
                    severity="error",
                    location=location,
                    context=line[:30] + "..." if len(line) > 30 else line,
                    original=line[:10] if len(line) > 10 else line,
                    suggestion=f"1.{line[:10]}" if len(line) > 10 else f"1.{line}"
                ))

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

        if config.get("check_mid_sentence_period", True):
            issues.extend(self._check_mid_sentence_period(line, location))

        return issues

    def _check_number_format(self, line: str, location: str) -> list[CheckIssue]:
        """检查序号格式：必须是 1. 2. 3. 格式"""
        issues = []

        # 检查重复序号：如 1.1. 或 1.1（包含后面的内容以便精确替换）
        match = re.match(r'^(\d+)\.(\d+)\.?(.{0,3})', line)
        if match and match.group(2):  # 确保有第二个数字
            # original 包含重复序号部分
            duplicate_part = f"{match.group(1)}.{match.group(2)}." if line.startswith(f"{match.group(1)}.{match.group(2)}.") else f"{match.group(1)}.{match.group(2)}"
            following_text = match.group(3) if match.group(3) else ""
            issues.append(CheckIssue(
                type="format",
                severity="error",
                location=location,
                context=line[:30] + "..." if len(line) > 30 else line,
                original=duplicate_part + following_text,
                suggestion=f"{match.group(1)}.{following_text}"
            ))
            return issues

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

        # 检查 （1） 或 (1) 格式
        match = re.match(r'^（(\d+)）', line)
        if match:
            issues.append(CheckIssue(
                type="format",
                severity="error",
                location=location,
                context=line[:20] + "..." if len(line) > 20 else line,
                original=f"（{match.group(1)}）",
                suggestion=f"{match.group(1)}."
            ))
            return issues

        match = re.match(r'^\((\d+)\)', line)
        if match:
            issues.append(CheckIssue(
                type="format",
                severity="error",
                location=location,
                context=line[:20] + "..." if len(line) > 20 else line,
                original=f"({match.group(1)})",
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
        
        # 9. 检查中英文标点混合重复（如 。. 或 .。）
        mixed_patterns = [
            (r'。\.', '。'),   # 中文句号+英文句号 -> 中文句号
            (r'\.。', '。'),   # 英文句号+中文句号 -> 中文句号
            (r'，,', '，'),    # 中文逗号+英文逗号 -> 中文逗号
            (r',，', '，'),    # 英文逗号+中文逗号 -> 中文逗号
            (r'；;', '；'),    # 中文分号+英文分号 -> 中文分号
            (r';；', '；'),    # 英文分号+中文分号 -> 中文分号
        ]
        for pattern, replacement in mixed_patterns:
            for match in re.finditer(pattern, line):
                start = max(0, match.start() - 3)
                end = min(len(line), match.end() + 3)
                context = line[start:end]
                issues.append(CheckIssue(
                    type="punctuation",
                    severity="error",
                    location=location,
                    context=context,
                    original=match.group(0),
                    suggestion=replacement
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

    def _check_mid_sentence_period(self, line: str, location: str) -> list[CheckIssue]:
        """检查句中句号：同一条内容中间不应该有句号，应该用分号"""
        issues = []
        if not line:
            return issues
        
        # 去掉序号部分
        content = re.sub(r'^\d+[.、。]\s*', '', line)
        if not content:
            return issues
        
        # 查找句中的句号（不是最后一个字符的句号）
        # 句号后面还有内容，说明是句中句号
        for match in re.finditer(r'。', content):
            pos = match.start()
            # 如果句号不是最后一个字符，说明是句中句号
            if pos < len(content) - 1:
                # 获取句号前后的上下文用于唯一定位
                start = max(0, pos - 3)
                end = min(len(content), pos + 4)
                context_str = content[start:end]
                
                # 确保 original 在整行中唯一
                original = context_str
                for length in range(len(context_str), min(len(content), pos + 10)):
                    test_start = max(0, pos - (length - 4))
                    test_end = min(len(content), pos + (length - 3))
                    test_str = content[test_start:test_end]
                    if line.count(test_str) == 1:
                        original = test_str
                        break
                
                # 将句号替换为分号
                suggestion = original.replace('。', '；', 1)
                
                issues.append(CheckIssue(
                    type="punctuation",
                    severity="error",
                    location=location,
                    context=content[:40] + "..." if len(content) > 40 else content,
                    original=original,
                    suggestion=suggestion
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
        
        # 获取末尾唯一标识（动态计算长度，确保在行内只出现一次）
        def get_unique_ending(line: str) -> str:
            """获取行末唯一标识，确保在整行中只出现一次"""
            for length in range(2, min(len(line) + 1, 20)):
                ending = line[-length:]
                # 检查这个结尾在整行中是否只出现一次
                if line.count(ending) == 1:
                    return ending
            # 如果找不到唯一的，返回整行
            return line

        # 以分号结尾，应改为句号
        if last_char == '；':
            context = line[-15:] if len(line) > 15 else line
            unique_ending = get_unique_ending(line)
            issues.append(CheckIssue(
                type="punctuation",
                severity="error",
                location=location,
                context=context,
                original=unique_ending,
                suggestion=unique_ending[:-1] + "。"
            ))
        # 以英文句号结尾，应改为中文句号
        elif last_char == '.':
            context = line[-15:] if len(line) > 15 else line
            unique_ending = get_unique_ending(line)
            issues.append(CheckIssue(
                type="punctuation",
                severity="error",
                location=location,
                context=context,
                original=unique_ending,
                suggestion=unique_ending[:-1] + "。"
            ))
        # 以感叹号结尾，公文中应改为句号
        elif last_char == '！':
            context = line[-15:] if len(line) > 15 else line
            unique_ending = get_unique_ending(line)
            issues.append(CheckIssue(
                type="punctuation",
                severity="error",
                location=location,
                context=context,
                original=unique_ending,
                suggestion=unique_ending[:-1] + "。"
            ))
        # 末尾不是句号（也不是其他合理结尾），提醒添加句号
        elif last_char != '。' and last_char not in '？）':
            context = line[-15:] if len(line) > 15 else line
            unique_ending = get_unique_ending(line)
            issues.append(CheckIssue(
                type="punctuation",
                severity="error",
                location=location,
                context=context,
                original=unique_ending,
                suggestion=unique_ending + "。"
            ))

        return issues


rule_checker = RuleChecker()
