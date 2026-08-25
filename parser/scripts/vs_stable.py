#!/usr/bin/env python3
"""Equibase Virtual Stable automation (Selenium + local Chrome).

Battle-tested 2026-08-25: logged in through the Imperva challenge, added
3 horses with pedigree comments, and verified them in the roster. See
equibase-virtual-stable.md at the repo root for the full guide.

Usage (run from anywhere; loads .env from the repo root):
    python3 parser/scripts/vs_stable.py login
    python3 parser/scripts/vs_stable.py search "Horse Name"
    python3 parser/scripts/vs_stable.py add "Horse Name" <yob> "(YY Sire - Dam)"
    python3 parser/scripts/vs_stable.py verify "Horse Name"
    python3 parser/scripts/vs_stable.py dump <url> [tag]

Requires in .env: EQUIBASE_PASSWORD (and optionally EQUIBASE_USER —
defaults to the Virtual Stable account stalliontracker108@gmail.com).

A visible Chrome window opens (headless tends to trip Imperva). The
Chrome profile persists in ~/.stalliontracker/eqb_chrome_profile so the
login session and Imperva clearance survive between invocations.
Page dumps (HTML + screenshot) land in ~/.stalliontracker/vs_dumps/.
"""
import os
import re
import sys
import time

from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(REPO_ROOT, ".env"))

HOME = os.path.expanduser("~/.stalliontracker")
PROFILE = os.path.join(HOME, "eqb_chrome_profile")
DUMPS = os.path.join(HOME, "vs_dumps")
os.makedirs(DUMPS, exist_ok=True)

VS_URL = "https://www.equibase.com/virtualstable/horse.cfm"
LOGIN_URL = ("https://www.equibase.com/premium/eebCustomerLogon.cfm"
             "?TMP=%2Fvirtualstable%2Fhorse%2Ecfm")


def make_driver() -> webdriver.Chrome:
    opts = Options()
    opts.add_argument(f"--user-data-dir={PROFILE}")
    opts.add_argument("--window-size=1400,1000")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    d = webdriver.Chrome(options=opts)
    d.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
    })
    d.set_page_load_timeout(60)
    return d


def dump(d, tag):
    open(os.path.join(DUMPS, f"eqb_{tag}.html"), "w").write(d.page_source)
    d.save_screenshot(os.path.join(DUMPS, f"eqb_{tag}.png"))
    print(f"[{tag}] url={d.current_url} title={d.title!r} -> {DUMPS}/eqb_{tag}.html")


def wait_challenge(d, timeout=25):
    """Give the Imperva 'Pardon Our Interruption' interstitial time to clear."""
    end = time.time() + timeout
    while time.time() < end:
        if "Pardon Our Interruption" not in d.page_source:
            return True
        time.sleep(1)
    return False


def ensure_logged_in(d):
    """Land on the VS horse page, logging in if the session has lapsed."""
    d.get(VS_URL)
    wait_challenge(d)
    time.sleep(2)
    if "customerLogonForm" not in d.page_source and "Logout" in d.page_source:
        return
    d.get(LOGIN_URL)
    wait_challenge(d)
    time.sleep(2)
    if "customerLogonForm" in d.page_source:
        user = os.environ.get("EQUIBASE_USER", "stalliontracker108@gmail.com")
        pw = os.environ["EQUIBASE_PASSWORD"]
        d.find_element(By.NAME, "user_id").send_keys(user)
        d.find_element(By.NAME, "customer_password").send_keys(pw)
        d.find_element(By.NAME, "continue_button").click()
        time.sleep(3)
        wait_challenge(d)
        time.sleep(2)
    if VS_URL not in d.current_url:
        d.get(VS_URL)
        wait_challenge(d)
        time.sleep(2)


def search(d, name):
    """Type into the add-a-horse search and submit. Leaves results rendered."""
    ensure_logged_in(d)
    box = d.find_element(By.ID, "horseSearchInput")
    box.clear()
    box.send_keys(name)
    d.find_element(By.ID, "findButton").click()
    time.sleep(4)
    wait_challenge(d)


def result_rows(d):
    """Parse #horseMatches result rows -> [(row, cells, display_name, age_sex)]."""
    out = []
    for row in d.find_elements(By.CSS_SELECTOR, "#horseMatches tbody tr"):
        try:
            cells = row.find_elements(By.TAG_NAME, "td")
            if len(cells) < 5:
                continue
            rname = cells[1].find_element(By.TAG_NAME, "a").text.strip()
            aslabel = cells[3].text.strip()  # e.g. "3 / F"
            out.append((row, cells, rname, aslabel))
        except Exception:
            continue
    return out


def add(d, name, yob, comment):
    # Horses age up on Jan 1, so racing age = current year - YOB. Used to
    # disambiguate same-name horses in the search results.
    from datetime import date
    age = date.today().year - yob
    search(d, name)
    rows = result_rows(d)
    print("candidates:", [(r[2], r[3]) for r in rows])
    match = None
    for row, cells, rname, aslabel in rows:
        # '=' prefix marks foreign-breds; strip it and the (CTY) suffix.
        plain = rname.lstrip("=").split(" (")[0].strip().lower()
        try:
            rage = int(aslabel.split("/")[0].strip())
        except ValueError:
            continue
        if plain == name.lower() and rage == age:
            match = (row, cells, rname, aslabel)
    if not match:
        print(f"NO-MATCH for {name} (expected age {age})")
        dump(d, f"add_nomatch_{name.replace(' ', '_')}")
        return False
    row, cells, rname, aslabel = match
    cb = cells[0].find_element(By.CSS_SELECTOR, "input[name='add']")
    if not cb.is_enabled():
        print(f"ALREADY-IN-STABLE: {rname} (checkbox disabled)")
        return True
    cfield = cells[4].find_element(By.CSS_SELECTOR, "input[type='text']")
    # Direct .click()/.send_keys() raises "not interactable" on this page —
    # drive the elements via JS and fire the events the page listens for.
    d.execute_script("""
        const [cb, cf, comment] = [arguments[0], arguments[1], arguments[2]];
        cb.checked = true;
        cb.dispatchEvent(new Event('change', {bubbles: true}));
        cb.dispatchEvent(new Event('click', {bubbles: true}));
        cf.value = comment;
        cf.dispatchEvent(new Event('input', {bubbles: true}));
        cf.dispatchEvent(new Event('change', {bubbles: true}));
    """, cb, cfield, comment)
    time.sleep(1)
    d.execute_script("arguments[0].click();",
                     d.find_element(By.ID, "horseAddSubmit"))
    time.sleep(4)
    wait_challenge(d)
    print(f"SUBMITTED {name} as {rname!r} {aslabel} comment={comment!r}")
    dump(d, f"add_done_{name.replace(' ', '_')}")
    return True


def verify(d, name):
    """Reload the roster and print the horse's row (name + saved comment)."""
    ensure_logged_in(d)
    html = d.page_source
    m = re.search(r'roster-count">([^<]*)', html)
    print("roster:", m.group(1) if m else "?")
    rows = re.findall(
        r'data-horse="([^"]*)".*?name="updateComment[A-Z0-9]+"[^>]*value="([^"]*)"',
        html, re.S)
    found = [(n.strip(), c) for n, c in rows
             if n.strip().lstrip("=").split(" (")[0].lower() == name.lower()]
    print(f"{name}: {found if found else 'NOT IN ROSTER'}")
    return bool(found)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    phase = sys.argv[1]
    d = make_driver()
    try:
        if phase == "login":
            ensure_logged_in(d)
            dump(d, "login")
        elif phase == "search":
            search(d, sys.argv[2])
            for _, _, rname, aslabel in result_rows(d):
                print(f"  {rname}  {aslabel}")
        elif phase == "add":
            ok = add(d, sys.argv[2], int(sys.argv[3]), sys.argv[4])
            sys.exit(0 if ok else 2)
        elif phase == "verify":
            ok = verify(d, sys.argv[2])
            sys.exit(0 if ok else 2)
        elif phase == "dump":
            d.get(sys.argv[2])
            wait_challenge(d)
            time.sleep(2)
            dump(d, sys.argv[3] if len(sys.argv) > 3 else "dump")
        else:
            print("unknown phase:", phase)
            sys.exit(1)
    finally:
        d.quit()


if __name__ == "__main__":
    main()
