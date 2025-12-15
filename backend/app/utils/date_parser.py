"""
Date range parser utility for parsing date range strings.

Supports formats:
- M.D-M.D (e.g., "12.7-12.13")
- MM.DD-MM.DD (e.g., "12.07-12.13")
- Cross-year format (e.g., "12.28-1.3")
"""

import re
from datetime import date


def parse_date_range(date_range: str, reference_date: date = None) -> tuple[date, date]:
    """
    Parse a date range string into start and end dates.
    
    Supports formats:
    - "M.D-M.D" (e.g., "12.7-12.13")
    - "MM.DD-MM.DD" (e.g., "12.07-12.13")
    - Cross-year format (e.g., "12.28-1.3")
    
    Args:
        date_range: Date range string to parse
        reference_date: Reference date for year inference, defaults to today
        
    Returns:
        Tuple of (start_date, end_date)
        
    Raises:
        ValueError: If the format cannot be parsed or dates are invalid
    """
    if reference_date is None:
        reference_date = date.today()
    
    # Pattern to match M.D-M.D or MM.DD-MM.DD format
    pattern = r'^(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})$'
    match = re.match(pattern, date_range.strip())
    
    if not match:
        raise ValueError("日期格式无法识别，请使用 M.D-M.D 格式")
    
    start_month = int(match.group(1))
    start_day = int(match.group(2))
    end_month = int(match.group(3))
    end_day = int(match.group(4))
    
    # Validate month range
    if not (1 <= start_month <= 12 and 1 <= end_month <= 12):
        raise ValueError("日期格式无法识别，请使用 M.D-M.D 格式")
    
    # Validate day range (basic check, detailed validation happens when creating date)
    if not (1 <= start_day <= 31 and 1 <= end_day <= 31):
        raise ValueError("日期格式无法识别，请使用 M.D-M.D 格式")
    
    # Determine years based on reference date
    ref_year = reference_date.year
    
    # Determine start year
    start_year = ref_year
    end_year = ref_year
    
    # Handle cross-year case: if end_month < start_month, it's a cross-year range
    if end_month < start_month:
        # e.g., "12.28-1.3" means Dec of current/previous year to Jan of next year
        # We need to determine which year based on reference date
        if reference_date.month <= end_month:
            # Reference is in early year, so start is previous year
            start_year = ref_year - 1
            end_year = ref_year
        else:
            # Reference is in later year, so end is next year
            start_year = ref_year
            end_year = ref_year + 1
    
    # Create date objects with validation
    try:
        start_date = date(start_year, start_month, start_day)
    except ValueError:
        raise ValueError("日期格式无法识别，请使用 M.D-M.D 格式")
    
    try:
        end_date = date(end_year, end_month, end_day)
    except ValueError:
        raise ValueError("日期格式无法识别，请使用 M.D-M.D 格式")
    
    return start_date, end_date
