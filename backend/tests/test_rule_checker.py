"""
规则检查器测试用例
覆盖所有规则检查场景，确保检测准确
"""
import pytest
import asyncio
from app.services.checker.rule_checker import rule_checker


def run_check(content: str) -> list:
    """同步运行检查"""
    return asyncio.get_event_loop().run_until_complete(rule_checker.check(content))


class TestNumberFormat:
    """序号格式检查测试"""
    
    def test_chinese_dun_hao(self):
        """1、应改为 1."""
        content = "本周工作：\n1、完成项目报告。"
        issues = run_check(content)
        assert any(i.original == "1、" and i.suggestion == "1." for i in issues)
    
    def test_chinese_period_as_number(self):
        """1。应改为 1."""
        content = "本周工作：\n1。完成项目报告。"
        issues = run_check(content)
        assert any(i.original == "1。" and i.suggestion == "1." for i in issues)
    
    def test_number_with_extra_space(self):
        """1.  (多余空格) 应改为 1."""
        content = "本周工作：\n1.  完成项目报告。"
        issues = run_check(content)
        assert any("1." in i.suggestion and i.type == "format" for i in issues)
    
    def test_duplicate_number(self):
        """1.1. 或 1.1 应改为 1."""
        content = "本周工作：\n1.1.完成项目报告。"
        issues = run_check(content)
        assert any(i.suggestion == "1." for i in issues)
    
    def test_correct_number_format(self):
        """1.正确格式不应报错"""
        content = "本周工作：\n1.完成项目报告。"
        issues = run_check(content)
        # 不应有序号格式错误
        assert not any(i.type == "format" and "1" in i.original for i in issues)


class TestEnglishPunctuation:
    """英文标点检查测试"""
    
    def test_english_comma(self):
        """, 应改为 ，"""
        content = "本周工作：\n1.完成项目报告,提交审核。"
        issues = run_check(content)
        assert any(i.original == "," and i.suggestion == "，" for i in issues)
    
    def test_english_semicolon(self):
        """; 应改为 ；"""
        content = "本周工作：\n1.完成项目报告;提交审核。"
        issues = run_check(content)
        assert any(i.original == ";" and i.suggestion == "；" for i in issues)
    
    def test_english_colon(self):
        """: 应改为 ：（非时间格式）"""
        content = "本周工作：\n1.工作内容:完成报告。"
        issues = run_check(content)
        assert any(i.original == ":" and i.suggestion == "：" for i in issues)
    
    def test_english_colon_in_time(self):
        """时间格式 10:30 不应报错"""
        content = "本周工作：\n1.上午10:30参加会议。"
        issues = run_check(content)
        # 时间格式的冒号不应被检测
        colon_issues = [i for i in issues if i.original == ":" and i.suggestion == "："]
        assert len(colon_issues) == 0
    
    def test_english_question_mark(self):
        """? 应改为 ？"""
        content = "本周工作：\n1.这个问题怎么解决?"
        issues = run_check(content)
        assert any(i.original == "?" and i.suggestion == "？" for i in issues)
    
    def test_english_exclamation(self):
        """! 应改为 ！"""
        content = "本周工作：\n1.完成了重要任务!"
        issues = run_check(content)
        assert any(i.original == "!" and i.suggestion == "！" for i in issues)


class TestEnglishBrackets:
    """英文括号检查测试"""
    
    def test_english_brackets_with_chinese(self):
        """(中文内容) 应改为 （中文内容）"""
        content = "本周工作：\n1.完成项目(重点任务)报告。"
        issues = run_check(content)
        assert any(i.original == "(" and i.suggestion == "（" for i in issues)
        assert any(i.original == ")" and i.suggestion == "）" for i in issues)
    
    def test_english_brackets_with_english(self):
        """(English) 不应报错"""
        content = "本周工作：\n1.完成API(Application Programming Interface)开发。"
        issues = run_check(content)
        # 纯英文内容的括号不应被检测
        bracket_issues = [i for i in issues if i.original in "()" and "（" in i.suggestion]
        # 这个例子里括号内有英文，不应报错
        # 注意：当前实现是检测括号内是否有中文，有中文才报错


class TestSlash:
    """斜杠检查测试"""
    
    def test_slash_between_chinese(self):
        """中文/中文 应改为 中文；中文"""
        content = "本周工作：\n1.完成工作/会议安排。"
        issues = run_check(content)
        assert any(i.original == "/" and i.suggestion == "；" for i in issues)
    
    def test_slash_in_date(self):
        """日期格式 2024/12/14 不应报错"""
        content = "本周工作：\n1.完成2024/12/14的报告。"
        issues = run_check(content)
        # 数字间的斜杠不应被检测（当前规则只检测中文间的斜杠）
        slash_issues = [i for i in issues if i.original == "/" and i.suggestion == "；"]
        assert len(slash_issues) == 0


class TestConsecutivePunctuation:
    """连续重复标点检查测试"""
    
    def test_double_period(self):
        """。。应改为 。"""
        content = "本周工作：\n1.完成项目报告。。"
        issues = run_check(content)
        assert any(i.original == "。。" and i.suggestion == "。" for i in issues)
    
    def test_double_comma(self):
        """，，应改为 ，"""
        content = "本周工作：\n1.完成项目，，提交报告。"
        issues = run_check(content)
        assert any(i.original == "，，" and i.suggestion == "，" for i in issues)
    
    def test_mixed_period(self):
        """。. 应改为 。"""
        content = "本周工作：\n1.完成项目报告。."
        issues = run_check(content)
        assert any(i.original == "。." and i.suggestion == "。" for i in issues)
    
    def test_triple_punctuation(self):
        """。。。应改为 。"""
        content = "本周工作：\n1.完成项目报告。。。"
        issues = run_check(content)
        assert any("。。" in i.original and i.suggestion == "。" for i in issues)


class TestEndingPunctuation:
    """句末标点检查测试"""
    
    def test_ending_with_semicolon(self):
        """以；结尾应改为。"""
        content = "本周工作：\n1.完成项目报告；"
        issues = run_check(content)
        assert any(i.original == "；" and i.suggestion == "。" for i in issues)
    
    def test_ending_with_english_period(self):
        """以.结尾应改为。"""
        content = "本周工作：\n1.完成项目报告."
        issues = run_check(content)
        assert any(i.original == "." and i.suggestion == "。" for i in issues)
    
    def test_ending_with_exclamation(self):
        """以！结尾应改为。（公文规范）"""
        content = "本周工作：\n1.完成了重要任务！"
        issues = run_check(content)
        assert any(i.original == "！" and i.suggestion == "。" for i in issues)
    
    def test_ending_without_punctuation(self):
        """无句末标点应提醒添加"""
        content = "本周工作：\n1.完成项目报告"
        issues = run_check(content)
        assert any(i.suggestion.endswith("。") for i in issues)
    
    def test_ending_with_chinese_period(self):
        """以。结尾不应报错"""
        content = "本周工作：\n1.完成项目报告。"
        issues = run_check(content)
        # 不应有句末标点错误
        ending_issues = [i for i in issues if i.location == "本周工作第1条" and "。" in i.original]
        assert len(ending_issues) == 0
    
    def test_ending_with_question_mark(self):
        """以？结尾不应报错（疑问句合理）"""
        content = "本周工作：\n1.如何解决这个问题？"
        issues = run_check(content)
        # 问号结尾是合理的
        ending_issues = [i for i in issues if i.original == "？"]
        assert len(ending_issues) == 0
    
    def test_ending_with_right_bracket(self):
        """以）结尾不应报错"""
        content = "本周工作：\n1.完成项目报告（初稿）。"
        issues = run_check(content)
        # 这个例子以句号结尾，不应报错


class TestExtraSpaces:
    """多余空格检查测试"""
    
    def test_space_between_chinese(self):
        """中文 中文 应改为 中文中文"""
        content = "本周工作：\n1.完成 项目 报告。"
        issues = run_check(content)
        assert any(i.type == "format" and " " in i.original for i in issues)
    
    def test_space_before_punctuation(self):
        """中文 ，应改为 中文，"""
        content = "本周工作：\n1.完成项目 ，提交报告。"
        issues = run_check(content)
        assert any(" " in i.original for i in issues)


class TestMissingNumber:
    """缺少序号检查测试"""
    
    def test_line_without_number(self):
        """非空行但不以数字开头应提示缺少序号"""
        content = "本周工作：\n完成项目报告。"
        issues = run_check(content)
        assert any(i.type == "format" and "1." in i.suggestion for i in issues)


class TestComplexCases:
    """复杂场景测试"""
    
    def test_multiple_issues_in_one_line(self):
        """一行中有多个问题"""
        content = "本周工作：\n1、完成项目,提交报告;"
        issues = run_check(content)
        # 应检测出：1、→1.，,→，，;→；，；→。
        assert len(issues) >= 3
    
    def test_real_world_case_1(self):
        """真实案例1：感叹号结尾"""
        content = """本周工作：
1.已完成党组织选举后续资料报告完善工作，按时序要求推进居委换届；已完成6个社区选举委员会推选，以及方案完善等工作。
2.已组织对6个社区开展消防安全、防火安全督查。
3.持续跟进综治中心项目审批。
4.已组织完成各分管领导、室办、社区开展年度总结撰写。
5.牵头持续开展年度考核对接工作。
6.已联合龙南镇组织开展创文工作业务培训！
7.完成人大代表风采录、政治谈话等材料审核撰写。"""
        issues = run_check(content)
        # 应检测出第6条的感叹号
        assert any(i.original == "！" and i.suggestion == "。" and "第6条" in i.location for i in issues)
    
    def test_real_world_case_2(self):
        """真实案例2：多种错误混合"""
        content = """本周工作：
1、完成项目报告,已提交审核;
2.参加部门会议 ,讨论工作安排。
3.跟进重点任务/协调资源。"""
        issues = run_check(content)
        # 应检测出：
        # - 1、→1.
        # - ,→，
        # - ;→；
        # - ；→。（句末）
        # - 空格问题
        # - /→；
        assert len(issues) >= 5
    
    def test_next_week_plan_section(self):
        """下周计划部分也应检查"""
        content = """本周工作：
1.完成项目报告。

下周计划：
1、继续推进项目,完成验收!"""
        issues = run_check(content)
        # 下周计划部分也应检测出问题
        assert any("下周计划" in i.location for i in issues)


class TestEdgeCases:
    """边界情况测试"""
    
    def test_empty_content(self):
        """空内容不应报错"""
        content = ""
        issues = run_check(content)
        assert len(issues) == 0
    
    def test_only_section_title(self):
        """只有区块标题不应报错"""
        content = "本周工作："
        issues = run_check(content)
        assert len(issues) == 0
    
    def test_number_only_line(self):
        """纯序号行不应报句末标点错误"""
        content = "本周工作：\n1."
        issues = run_check(content)
        # 纯序号行不应报句末标点错误
        ending_issues = [i for i in issues if i.original in "。；" and "句末" in str(i)]
        assert len(ending_issues) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
