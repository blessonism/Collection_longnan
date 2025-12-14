import asyncio
from app.services.checker.rule_checker import rule_checker

async def test():
    content = '''本周工作：
4.4.协调资源配置。'''
    issues = await rule_checker.check(content)
    for issue in issues:
        print(f'original: [{issue.original}]')
        print(f'suggestion: [{issue.suggestion}]')
        print(f'context: [{issue.context}]')
        print('---')

asyncio.run(test())
