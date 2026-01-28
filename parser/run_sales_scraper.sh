#!/bin/bash
# TDN Sales Scraper - Cron wrapper script
#
# Add to crontab with: crontab -e
# 30 0 * * * /path/to/parser/run_sales_scraper.sh >> /path/to/logs/sales_scraper.log 2>&1
#
# This runs daily at 12:30 AM

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Run the scraper
echo "=========================================="
echo "Sales scraper started: $(date)"
echo "=========================================="

python3 sales_scraper_main.py --once

echo "Completed: $(date)"
echo ""
