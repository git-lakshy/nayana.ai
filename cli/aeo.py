import sys
import argparse
import time
import urllib.request
import json
from typing import List, Optional

# Color constants
COLOR_RESET = "\033[0m"
COLOR_BOLD = "\033[1m"
COLOR_GREEN = "\033[32m"
COLOR_YELLOW = "\033[33m"
COLOR_BLUE = "\033[34m"
COLOR_PURPLE = "\033[35m"
COLOR_CYAN = "\033[36m"
COLOR_RED = "\033[31m"

def print_header(title: str):
    print(f"\n{COLOR_BOLD}{COLOR_PURPLE}=== {title} ==={COLOR_RESET}\n")

def make_request(api_url: str, endpoint: str, method: str = "GET", data: Optional[dict] = None) -> dict:
    url = f"{api_url}/{endpoint}"
    req_data = None
    
    if data is not None:
        req_data = json.dumps(data).encode("utf-8")
        
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json"} if req_data else {},
        method=method
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"{COLOR_RED}{COLOR_BOLD}Connection Error:{COLOR_RESET} Could not connect to A-EYE Control Plane at {url}.")
        print("Please verify that the FastAPI backend server is running and accessible.")
        sys.exit(1)
    except Exception as e:
        print(f"{COLOR_RED}Request failed: {e}{COLOR_RESET}")
        sys.exit(1)

def run_scan(api_url: str, target_url: str, competitors: List[str]):
    print_header("A-EYE SWARM CRAWLER & EVALUATOR")
    print(f"{COLOR_CYAN}Target URL:{COLOR_RESET} {target_url}")
    if competitors:
        print(f"{COLOR_CYAN}Competitors:{COLOR_RESET} {', '.join(competitors)}")
    print(f"\n{COLOR_YELLOW}Triggering Nasiko swarm agents...{COLOR_RESET}")
    
    steps = [
        "Knowledge Ingestion Agent: structuring website...",
        "User Intent Agent: compiling user questions...",
        "AI Testing and Evaluation Agent: Vertex AI simulation...",
        "Competitor Intelligence Agent: processing rival sites...",
        "Content Gap Agent: finalizing score cards..."
    ]
    
    for step in steps:
        time.sleep(0.4)
        print(f" {COLOR_BLUE}*{COLOR_RESET} {step}")
        
    # Trigger scan API call
    payload = {"url": target_url, "competitors": competitors}
    result = make_request(api_url, "scan", method="POST", data=payload)
    
    score = result.get("overall_aeo_score", 0)
    success = result.get("question_success_rate", 0.0)
    trust = result.get("documentation_trust", 0.0)
    
    print(f"\n{COLOR_GREEN}{COLOR_BOLD}[OK] Scan successfully finished!{COLOR_RESET}\n")
    
    print(f"{COLOR_BOLD}--- SCORES ---{COLOR_RESET}")
    print(f"Overall A-EYE Score:      {COLOR_GREEN}{COLOR_BOLD}{score}%{COLOR_RESET}")
    print(f"User Intent Success:    {COLOR_CYAN}{success}%{COLOR_RESET}")
    print(f"Documentation Trust:    {COLOR_CYAN}{trust}%{COLOR_RESET}")
    print()
    
    print(f"{COLOR_BOLD}--- COMPETITOR BENCHMARK ---{COLOR_RESET}")
    for comp in result.get("competitors", []):
        score_bar = "#" * (comp["score"] // 5) + "-" * (20 - (comp["score"] // 5))
        is_target = comp["url"] == target_url
        color = COLOR_GREEN if is_target else COLOR_YELLOW
        print(f"{color}{comp['name']:<35} [{comp['score']:>3}%] |{score_bar}|{COLOR_RESET}")
        
    print(f"\n{COLOR_YELLOW}[INFO] Run 'aeo fix' to apply the swarm's recommended code fixes locally.{COLOR_RESET}")

def run_fix(api_url: str):
    print_header("A-EYE SWARM AUTOMATED REMEDIATION")
    print(f"{COLOR_YELLOW}Fetching pending gaps from the control plane...{COLOR_RESET}")
    
    metrics = make_request(api_url, "metrics")
    queue = metrics.get("remediation_queue", [])
    pending_fixes = [f for f in queue if f["status"] == "pending"]
    
    if not pending_fixes:
        print(f"\n{COLOR_GREEN}[OK] Codebase is fully optimized. No pending fixes in the swarm queue.{COLOR_RESET}")
        return
        
    print(f"\nFound {COLOR_BOLD}{len(pending_fixes)}{COLOR_RESET} pending gaps. Executing Remediation Agent...")
    
    for idx, fix in enumerate(pending_fixes):
        print(f"\n{COLOR_CYAN}Fix {idx+1}: {fix['title']}{COLOR_RESET}")
        print(f"Target File: {COLOR_YELLOW}{fix['file']}{COLOR_RESET}")
        print(f"Description: {fix['description']}")
        print(f"Agent:       {fix['agent']}")
        print(f"Proposed Diff:")
        
        for line in fix["diff"].split("\n"):
            if line.startswith("+"):
                print(f"{COLOR_GREEN}{line}{COLOR_RESET}")
            elif line.startswith("-"):
                print(f"{COLOR_RED}{line}{COLOR_RESET}")
            else:
                print(line)
                
        print(f"\n{COLOR_BLUE}Applying code changes to local file...{COLOR_RESET}")
        time.sleep(0.5)
        
        result = make_request(api_url, "fix", method="POST", data={"fix_id": fix["id"]})
        print(f"{COLOR_GREEN}{COLOR_BOLD}[OK] {result.get('message')}{COLOR_RESET}")
        print(f"Updated overall A-EYE Score: {COLOR_GREEN}{COLOR_BOLD}{result.get('updated_score')}%{COLOR_RESET}")

def run_status(api_url: str):
    print_header("A-EYE SYSTEM STATUS & AGENT REGISTRY")
    
    print(f"{COLOR_BOLD}Connecting to Control Plane...{COLOR_RESET}", end="", flush=True)
    metrics = make_request(api_url, "metrics")
    agents = make_request(api_url, "agents")
    print(f" {COLOR_GREEN}[CONNECTED]{COLOR_RESET}\n")
    
    # 1. System Health Metrics
    m = metrics.get("metrics", {})
    print(f"{COLOR_BOLD}=== Control Plane Health ==={COLOR_RESET}")
    print(f"Overall A-EYE Index:      {COLOR_GREEN}{m.get('overall_aeo_score', 0)}%{COLOR_RESET}")
    print(f"Question Success Rate:    {COLOR_CYAN}{m.get('question_success_rate', 0)}%{COLOR_RESET}")
    print(f"Documentation Trust:    {COLOR_CYAN}{m.get('documentation_trust', 0)}%{COLOR_RESET}")
    print(f"Total Evaluator Scans:  {m.get('total_scans_run', 0)}")
    
    # Gaps count
    queue = metrics.get("remediation_queue", [])
    pending = len([f for f in queue if f["status"] == "pending"])
    applied = len([f for f in queue if f["status"] == "applied"])
    print(f"Remediation Queue:      {COLOR_YELLOW}{pending} Pending{COLOR_RESET} | {COLOR_GREEN}{applied} Applied{COLOR_RESET}")
    
    # Github linking
    gh = metrics.get("github_config", {})
    linked = "YES" if (gh.get("owner") and gh.get("repo")) else "NO"
    print(f"GitHub Repository:      {COLOR_PURPLE}{linked}{COLOR_RESET} ({gh.get('owner')}/{gh.get('repo') if linked == 'YES' else 'Not Configured'})")
    print()
    
    # 2. Agent Registry
    print(f"{COLOR_BOLD}=== Nasiko Agent Registry ({len(agents)} Active) ==={COLOR_RESET}")
    print(f"{'Agent Name':<25} | {'Protocol':<8} | {'Transport':<10} | {'Capabilities'}")
    print("-" * 75)
    for agent in agents:
        caps = agent.get("capabilities", {})
        cap_str = []
        if caps.get("streaming"): cap_str.append("Stream")
        if caps.get("stateTransitionHistory"): cap_str.append("History")
        print(f"{COLOR_BLUE}{agent.get('name'):<25}{COLOR_RESET} | {agent.get('protocolVersion'):<8} | {agent.get('preferredTransport'):<10} | {', '.join(cap_str)}")
    print()

def run_history(api_url: str):
    print_header("A-EYE SCORE TREND HISTORY")

    metrics = make_request(api_url, "metrics")
    history = metrics.get("aeo_score_history", [])

    if not history:
        print(f"{COLOR_YELLOW}No historic scan evaluations registered in database.{COLOR_RESET}")
        return

    print(f"{COLOR_BOLD}Historical A-EYE score progress chart:{COLOR_RESET}\n")

    # Draw horizontal bar chart
    for entry in history:
        d = entry.get("date", "Unknown")
        s = entry.get("score", 0)

        # Build score bar
        bar_len = s // 4
        bar = "#" * bar_len + "-" * (25 - bar_len)

        print(f" {COLOR_CYAN}{d}{COLOR_RESET} | {COLOR_GREEN}{s:>3}%{COLOR_RESET} |{bar}|")

    print()


# ---------- Phase 1 crawler commands ----------

def _trunc(s: str, n: int) -> str:
    s = s or ""
    return s if len(s) <= n else s[: n - 1] + "…"


def _bar(value: float, width: int = 20) -> str:
    fill = max(0, min(width, int(value * width / 100)))
    return "#" * fill + "-" * (width - fill)


def run_crawl(api_url: str, target_url: str, max_pages: int, max_depth: int, delay_ms: int):
    print_header("A-EYE CRAWLER (Phase 1)")
    print(f"{COLOR_CYAN}Target URL:{COLOR_RESET}    {target_url}")
    print(f"{COLOR_CYAN}Max pages:{COLOR_RESET}     {max_pages}")
    print(f"{COLOR_CYAN}Max depth:{COLOR_RESET}     {max_depth}")
    print(f"{COLOR_CYAN}Politeness:{COLOR_RESET}    {delay_ms}ms/req")
    print(f"\n{COLOR_YELLOW}Starting BFS crawl (synchronous, in-process)...{COLOR_RESET}")

    payload = {
        "root_url": target_url,
        "max_pages": max_pages,
        "max_depth": max_depth,
        "per_host_delay_ms": delay_ms,
    }
    result = make_request(api_url, "crawl", method="POST", data=payload)

    status = result.get("status", "?")
    scan = result.get("scan") or {}
    print(f"\n{COLOR_GREEN}{COLOR_BOLD}[OK] Crawl finished: status={status}{COLOR_RESET}")
    print(f"Scan #{scan.get('id')}  started={scan.get('started_at')}  "
          f"finished={scan.get('finished_at')}")
    print(f"  pages found   = {COLOR_CYAN}{scan.get('pages_found')}{COLOR_RESET}")
    print(f"  pages crawled = {COLOR_GREEN}{scan.get('pages_crawled')}{COLOR_RESET}")
    print(f"  chunks        = {COLOR_PURPLE}{scan.get('chunks_count')}{COLOR_RESET}")
    err = scan.get("error")
    if err:
        print(f"  {COLOR_RED}error: {err}{COLOR_RESET}")
    print(f"\nNext steps:")
    print(f"  aeo scans                 # list all scans")
    print(f"  aeo scan-show {scan.get('id')}           # page-type breakdown for this scan")
    print(f"  aeo pages {scan.get('id')}               # pages discovered")
    print(f"  aeo chunks {scan.get('id')}              # chunks for grounding (Phase 2+)")


def run_scans_list(api_url: str, limit: int):
    print_header("A-EYE CRAWL HISTORY")
    payload = make_request(api_url, f"scans?limit={limit}")
    scans = payload.get("scans", [])
    if not scans:
        print(f"{COLOR_YELLOW}No scans recorded yet. Run `aeo crawl <url>` to start one.{COLOR_RESET}")
        return
    print(f"{COLOR_BOLD}{'ID':>4} | {'Status':<10} | {'Found':>5} | {'Crawled':>7} | "
          f"{'Chunks':>6} | {'Started':<20} | Root URL")
    print("-" * 110)
    for s in scans:
        print(f"{COLOR_CYAN}{s.get('id'):>4}{COLOR_RESET} | "
              f"{COLOR_GREEN}{s.get('status', '?'):<10}{COLOR_RESET} | "
              f"{s.get('pages_found', 0):>5} | "
              f"{s.get('pages_crawled', 0):>7} | "
              f"{COLOR_PURPLE}{s.get('chunks_count', 0):>6}{COLOR_RESET} | "
              f"{s.get('started_at', '')[:19]:<20} | "
              f"{_trunc(s.get('root_url', ''), 50)}")
    print(f"\nUse `aeo scan-show <id>` for full details, "
          f"`aeo pages <id>` for the page list.")


def run_scan_show(api_url: str, scan_id: int):
    print_header(f"A-EYE SCAN #{scan_id}")
    payload = make_request(api_url, f"scans/{scan_id}")
    fields = [
        ("Status", payload.get("status")),
        ("Started", payload.get("started_at")),
        ("Finished", payload.get("finished_at")),
        ("Root URL", payload.get("root_url")),
        ("Pages found", payload.get("pages_found")),
        ("Pages crawled", payload.get("pages_crawled")),
        ("Chunks", payload.get("chunks_count")),
    ]
    cfg = payload.get("config") or {}
    if cfg:
        fields.append(("Max pages", cfg.get("max_pages")))
        fields.append(("Max depth", cfg.get("max_depth")))
        fields.append(("Delay (ms)", cfg.get("per_host_delay_ms")))

    for k, v in fields:
        v_str = "" if v is None else str(v)
        print(f" {COLOR_BOLD}{k:<14}{COLOR_RESET} {COLOR_CYAN}{v_str}{COLOR_RESET}")

    err = payload.get("error")
    if err:
        print(f" {COLOR_BOLD}{'Error':<14}{COLOR_RESET} {COLOR_RED}{err}{COLOR_RESET}")

    breakdown = payload.get("page_type_breakdown") or []
    if breakdown:
        print(f"\n{COLOR_BOLD}Page type breakdown:{COLOR_RESET}")
        for row in breakdown:
            pt = row.get("page_type") or "unknown"
            n = row.get("n", 0)
            bar = _bar(min(100, n * 20))   # not a percentage; just visual
            print(f"  {pt:<12} {n:>3}  |{bar}|")


def run_pages_list(api_url: str, scan_id: int, page_type: Optional[str], limit: int):
    print_header(f"PAGES  ·  Scan #{scan_id}" + (f"  ·  type={page_type}" if page_type else ""))
    qs = f"?limit={limit}" + (f"&page_type={page_type}" if page_type else "")
    payload = make_request(api_url, f"scans/{scan_id}/pages{qs}")
    pages = payload.get("pages", [])
    if not pages:
        print(f"{COLOR_YELLOW}No pages recorded.{COLOR_RESET}")
        return
    print(f"{COLOR_BOLD}{'ID':>4} | {'Type':<11} | {'Words':>5} | {'JLD':>3} | "
          f"{'Outlinks':>8} | Title{COLOR_RESET}")
    print("-" * 110)
    for p in pages:
        title = _trunc(p.get("title") or "<no title>", 50)
        print(f"{COLOR_CYAN}{p.get('id'):>4}{COLOR_RESET} | "
              f"{COLOR_GREEN}{(p.get('page_type') or '?'):<11}{COLOR_RESET} | "
              f"{p.get('word_count', 0):>5} | "
              f"{p.get('json_ld_count', 0):>3} | "
              f"{p.get('outlinks_count', 0):>8} | "
              f"{title}")
    print(f"\n{len(pages)} pages. Use `aeo chunks {scan_id} --page-id <id>` to see chunks.")


def run_chunks_list(api_url: str, scan_id: int, page_id: Optional[int], limit: int):
    print_header(f"CHUNKS  ·  Scan #{scan_id}" + (f"  ·  page={page_id}" if page_id else ""))
    qs = f"?limit={limit}" + (f"&page_id={page_id}" if page_id else "")
    payload = make_request(api_url, f"scans/{scan_id}/chunks{qs}")
    chunks = payload.get("chunks", [])
    if not chunks:
        print(f"{COLOR_YELLOW}No chunks recorded for this view.{COLOR_RESET}")
        return
    print(f"{COLOR_BOLD}{'ID':>4} | {'Page':>4} | {'Ord':>3} | {'Words':>5} | "
          f"{'Heading path':<40} | Preview{COLOR_RESET}")
    print("-" * 130)
    for c in chunks:
        path_disp = _trunc(c.get("heading_path") or "", 40)
        preview = _trunc((c.get("preview") or "").replace("\n", " "), 70)
        print(f"{COLOR_CYAN}{c.get('id'):>4}{COLOR_RESET} | "
              f"{c.get('page_id'):>4} | "
              f"{c.get('ordinal'):>3} | "
              f"{c.get('word_count', 0):>5} | "
              f"{COLOR_PURPLE}{path_disp:<40}{COLOR_RESET} | "
              f"{preview}")
    print(f"\n{len(chunks)} chunks shown.")


def run_gaps_list(api_url: str, scan_id: int):
    print_header(f"GAPS  ·  Scan #{scan_id}")
    payload = make_request(api_url, f"scans/{scan_id}/gaps")
    gaps = payload.get("gaps", [])
    if not gaps:
        print(f"{COLOR_GREEN}[OK] No heuristic gaps detected for this scan.{COLOR_RESET}")
        return
    print(f"{COLOR_BOLD}{len(gaps)} gap(s) detected:{COLOR_RESET}\n")
    for gap in gaps:
        color = COLOR_RED if gap.get("severity") == "high" else COLOR_YELLOW if gap.get("severity") == "medium" else COLOR_BLUE
        print(f"{color}[{gap['severity'].upper()}] {gap['type']}{COLOR_RESET}")
        print(f"  Page: {gap.get('title') or gap.get('url')}")
        print(f"  Fix:  {gap.get('suggested_fix')}")
        print()


def run_fixes_generate(api_url: str, scan_id: int, force: bool):
    print_header(f"FIXES  ·  Generate  ·  Scan #{scan_id}")
    qs = "?force=true" if force else ""
    payload = make_request(api_url, f"scans/{scan_id}/fixes/generate{qs}", method="POST")
    fixes = payload.get("fixes", [])
    print(f"{COLOR_GREEN}Generated {payload.get('generated', 0)} fix(es).{COLOR_RESET}\n")
    _print_fixes(fixes)


def run_fixes_list(api_url: str, scan_id: int, status: Optional[str]):
    print_header(f"FIXES  ·  Scan #{scan_id}" + (f"  ·  status={status}" if status else ""))
    qs = f"?status={status}" if status else ""
    payload = make_request(api_url, f"scans/{scan_id}/fixes{qs}")
    fixes = payload.get("fixes", [])
    if not fixes:
        print(f"{COLOR_YELLOW}No fixes found. Run `aeo fixes generate {scan_id}` first.{COLOR_RESET}")
        return
    print(f"{COLOR_BOLD}{payload.get('total', len(fixes))} fix(es):{COLOR_RESET}\n")
    _print_fixes(fixes)


def _print_fixes(fixes: list):
    for fix in fixes:
        sev = fix.get("severity", "")
        color = COLOR_RED if sev == "high" else COLOR_YELLOW if sev == "medium" else COLOR_BLUE
        status = fix.get("status", "?")
        status_color = COLOR_GREEN if status == "applied" else COLOR_YELLOW if status == "pending" else COLOR_PURPLE
        print(f"{color}[{(sev or '?').upper():6}] #{fix.get('id')} {fix.get('title')}{COLOR_RESET}")
        print(f"  Status:   {status_color}{status}{COLOR_RESET}")
        print(f"  Type:     {fix.get('fix_type')}")
        print(f"  File:     {fix.get('file_hint') or '(no file hint)'}")
        print(f"  Desc:     {(fix.get('description') or '')[:120]}")
        print()


def run_fix_show(api_url: str, scan_id: int, fix_id: int):
    print_header(f"FIX #{fix_id}  ·  Scan #{scan_id}")
    payload = make_request(api_url, f"scans/{scan_id}/fixes/{fix_id}")
    fix = payload.get("fix", {})
    print(f" {COLOR_BOLD}{'Title':<14}{COLOR_RESET} {fix.get('title')}")
    print(f" {COLOR_BOLD}{'Type':<14}{COLOR_RESET} {fix.get('fix_type')}")
    print(f" {COLOR_BOLD}{'Severity':<14}{COLOR_RESET} {fix.get('severity')}")
    print(f" {COLOR_BOLD}{'Status':<14}{COLOR_RESET} {fix.get('status')}")
    print(f" {COLOR_BOLD}{'File hint':<14}{COLOR_RESET} {fix.get('file_hint') or '(none)'}")
    print(f" {COLOR_BOLD}{'Language':<14}{COLOR_RESET} {fix.get('language') or '(none)'}")
    print(f"\n{COLOR_BOLD}Description:{COLOR_RESET}\n{fix.get('description')}")
    print(f"\n{COLOR_BOLD}Content:{COLOR_RESET}")
    print(fix.get("content", ""))


def run_fix_apply(api_url: str, scan_id: int, fix_id: int):
    print_header(f"APPLY FIX #{fix_id}  ·  Scan #{scan_id}")
    payload = make_request(api_url, f"scans/{scan_id}/fixes/{fix_id}/apply", method="POST")
    fix = payload.get("fix", {})
    print(f"{COLOR_GREEN}[OK] Fix marked as applied.{COLOR_RESET}")
    print(f"  #{fix.get('id')} {fix.get('title')}")
    print(f"  Applied at: {fix.get('applied_at')}")


def run_fix_dismiss(api_url: str, scan_id: int, fix_id: int):
    print_header(f"DISMISS FIX #{fix_id}  ·  Scan #{scan_id}")
    payload = make_request(api_url, f"scans/{scan_id}/fixes/{fix_id}/dismiss", method="POST")
    print(f"{COLOR_YELLOW}[OK] Fix dismissed.{COLOR_RESET}")


def run_score(api_url: str, scan_id: int):
    print_header(f"AI VISIBILITY SCORE  ·  Scan #{scan_id}")
    payload = make_request(api_url, f"scans/{scan_id}/score")

    score = payload.get("ai_coverage_score", 0)
    bar_len = int(score / 5)
    bar = "#" * bar_len + "-" * (20 - bar_len)
    score_color = COLOR_GREEN if score >= 70 else COLOR_YELLOW if score >= 40 else COLOR_RED

    print(f"  {COLOR_BOLD}AI Visibility Score:{COLOR_RESET} {score_color}{COLOR_BOLD}{score}%{COLOR_RESET}  |{bar}|\n")

    bd = payload.get("breakdown", {})
    print(f"{COLOR_BOLD}Score Breakdown:{COLOR_RESET}")
    print(f"  Base score:              100")
    print(f"  {COLOR_RED}Penalty (high gaps):    -{bd.get('penalty_high_gaps', 0)}{COLOR_RESET}")
    print(f"  {COLOR_YELLOW}Penalty (medium gaps):  -{bd.get('penalty_medium_gaps', 0)}{COLOR_RESET}")
    print(f"  {COLOR_BLUE}Penalty (low gaps):     -{bd.get('penalty_low_gaps', 0)}{COLOR_RESET}")
    print(f"  {COLOR_GREEN}Bonus (confidence):    +{bd.get('bonus_confidence', 0)}{COLOR_RESET}")
    print(f"  {COLOR_GREEN}Bonus (attribution):   +{bd.get('bonus_attribution', 0)}{COLOR_RESET}")

    gs = payload.get("gap_summary", {})
    print(f"\n{COLOR_BOLD}Gap Summary:{COLOR_RESET}")
    print(f"  Total: {gs.get('total')}  High: {COLOR_RED}{gs.get('high')}{COLOR_RESET}  Medium: {COLOR_YELLOW}{gs.get('medium')}{COLOR_RESET}  Low: {COLOR_BLUE}{gs.get('low')}{COLOR_RESET}")

    llm = payload.get("llm_signal", {})
    print(f"\n{COLOR_BOLD}LLM Signal:{COLOR_RESET}")
    if llm.get("has_test_data"):
        print(f"  Avg Confidence:  {COLOR_CYAN}{llm.get('avg_confidence')}{COLOR_RESET}")
        print(f"  Avg Attribution: {COLOR_CYAN}{llm.get('avg_attribution')}{COLOR_RESET}")
        if llm.get("avg_accuracy") is not None:
            print(f"  Avg Accuracy:    {COLOR_CYAN}{llm.get('avg_accuracy')}{COLOR_RESET}")
    else:
        print(f"  {COLOR_YELLOW}No LLM test data yet. Run `aeo test <scan_id>` to add signal.{COLOR_RESET}")

    fx = payload.get("fixes", {})
    print(f"\n{COLOR_BOLD}Fixes:{COLOR_RESET}  {fx.get('applied')} applied / {fx.get('pending')} pending")


def run_history(api_url: str, domain: str):
    print_header(f"SCORE HISTORY  ·  {domain}")
    payload = make_request(api_url, f"domains/{domain}/history")
    rows = payload.get("history", [])
    if not rows:
        print(f"{COLOR_YELLOW}No score history for {domain}. Run `aeo score <scan_id>` to record one.{COLOR_RESET}")
        return
    print(f"{COLOR_BOLD}{'Date':<22} {'Score':>6}  Chart{COLOR_RESET}")
    print("-" * 60)
    for row in rows:
        score = row.get("ai_coverage_score") or 0
        bar_len = int(score / 4)
        bar = "#" * bar_len + "-" * (25 - bar_len)
        score_color = COLOR_GREEN if score >= 70 else COLOR_YELLOW if score >= 40 else COLOR_RED
        print(f"  {COLOR_CYAN}{row.get('recorded_at', '')[:19]}{COLOR_RESET}  {score_color}{score:>6.1f}%{COLOR_RESET}  |{bar}|")
    print()


def run_sov(api_url: str, scan_id: int):
    print_header(f"SHARE-OF-VOICE  ·  Scan #{scan_id}")
    payload = make_request(api_url, f"sov/{scan_id}")
    if "error" in payload:
        print(f"{COLOR_RED}Error: {payload['error']}{COLOR_RESET}")
        return

    overall = payload.get("overall_target_sov", 0)
    brand = payload.get("overall_target_brand_mention_rate", 0)
    print(f"  Target URL: {COLOR_CYAN}{payload.get('target_url')}{COLOR_RESET}")
    print(f"  Competitors: {payload.get('competitor_count', 0)}")
    print(f"  Brand Mention Rate: {COLOR_GREEN}{brand:.1%}{COLOR_RESET}")
    sov_color = COLOR_GREEN if overall >= 0.5 else COLOR_YELLOW if overall >= 0.3 else COLOR_RED
    print(f"  Overall SOV: {sov_color}{COLOR_BOLD}{overall:.1%}{COLOR_RESET}\n")

    sov_by_provider = payload.get("sov_by_provider", {})
    if sov_by_provider:
        print(f"{COLOR_BOLD}Per-Provider SOV:{COLOR_RESET}")
        for provider, data in sov_by_provider.items():
            sov = data.get("target_sov", 0)
            bar_len = int(sov * 20)
            bar = "#" * bar_len + "-" * (20 - bar_len)
            sov_c = COLOR_GREEN if sov >= 0.5 else COLOR_YELLOW
            print(f"  {COLOR_BLUE}{provider:<12}{COLOR_RESET} SOV={sov_c}{sov:.1%}{COLOR_RESET}  |{bar}|  brand={data.get('target_brand_mention_rate', 0):.1%}")
    else:
        print(f"{COLOR_YELLOW}No per-provider data. Run `aeo test <scan_id>` first.{COLOR_RESET}")


def run_sov_link(api_url: str, parent_scan_id: int, competitor_scan_id: int, competitor_url: str):
    print_header("LINK COMPETITOR SCAN")
    payload = make_request(api_url, "sov/link", method="POST", data={
        "parent_scan_id": parent_scan_id,
        "competitor_scan_id": competitor_scan_id,
        "competitor_url": competitor_url,
    })
    print(f"{COLOR_GREEN}[OK] Linked scan #{competitor_scan_id} ({competitor_url}) as competitor of scan #{parent_scan_id}.{COLOR_RESET}")


def run_test(api_url: str, scan_id: int, brand: str, domain: str):
    print_header(f"MULTI-LLM TEST  ·  Scan #{scan_id}")
    print(f"{COLOR_YELLOW}Running test pipeline... (this may take a moment){COLOR_RESET}")
    payload = make_request(api_url, "test/run", method="POST", data={
        "scan_id": scan_id,
        "brand": brand,
        "domain": domain,
    })
    status = payload.get("status", "?")
    status_color = COLOR_GREEN if status == "success" else COLOR_YELLOW
    print(f"\n{status_color}[{status.upper()}]{COLOR_RESET}")
    print(f"  Questions generated: {COLOR_CYAN}{payload.get('questions_generated')}{COLOR_RESET}")
    print(f"  Answers generated:   {COLOR_CYAN}{payload.get('answers_generated')}{COLOR_RESET}")
    print(f"  Providers used:      {COLOR_CYAN}{', '.join(payload.get('providers', []))}{COLOR_RESET}")
    errors = payload.get("errors", [])
    if errors:
        print(f"  {COLOR_YELLOW}Errors: {errors}{COLOR_RESET}")
    print(f"\nNext: `aeo score {scan_id}` to compute your AI visibility score.")


def main():
    parser = argparse.ArgumentParser(description="A-EYE Command Line Swarm Utility.")
    parser.add_argument("-p", "--port", type=int, default=8000, help="FastAPI server port (default: 8000)")
    parser.add_argument("-s", "--server", type=str, default=None, help="Custom FastAPI server URL (overrides port)")
    
    subparsers = parser.add_subparsers(dest="command", help="Swarm commands")
    
    # scan command
    scan_parser = subparsers.add_parser("scan", help="Initiate A-EYE simulation scan of target site.")
    scan_parser.add_argument("url", type=str, help="Target URL to optimization scan.")
    scan_parser.add_argument("--competitors", type=str, default="", help="Comma-separated competitor URLs.")
    
    # fix command
    subparsers.add_parser("fix", help="Approve and apply swarm-generated codebase fixes.")

    # status command
    subparsers.add_parser("status", help="Query agent capabilities registry and health metrics.")

    # history command
    subparsers.add_parser("history", help="Render score evaluation trends over time.")

    # --- Phase 1 crawler commands ---
    crawl_parser = subparsers.add_parser("crawl", help="Run the Phase 1 BFS crawler against a target URL.")
    crawl_parser.add_argument("url", type=str, help="Target URL (e.g. https://example.com).")
    crawl_parser.add_argument("--max-pages", type=int, default=25, help="Maximum pages to crawl (default 25).")
    crawl_parser.add_argument("--max-depth", type=int, default=2, help="Maximum BFS depth (default 2).")
    crawl_parser.add_argument("--delay-ms", type=int, default=200, help="Per-host politeness delay in ms (default 200).")

    scans_parser = subparsers.add_parser("scans", help="List recent crawler scans.")
    scans_parser.add_argument("--limit", type=int, default=20, help="Maximum scans to show (default 20).")

    scan_show_parser = subparsers.add_parser("scan-show", help="Show details for a single scan (id, status, page-type breakdown).")
    scan_show_parser.add_argument("id", type=int, help="Scan ID.")

    pages_parser = subparsers.add_parser("pages", help="List pages discovered by a scan.")
    pages_parser.add_argument("scan_id", type=int, help="Scan ID.")
    pages_parser.add_argument("--type", dest="page_type", type=str, default=None,
                              help="Filter by page type (landing|docs|faq|pricing|changelog|integration|blog|other).")
    pages_parser.add_argument("--limit", type=int, default=200, help="Max pages to show.")

    chunks_parser = subparsers.add_parser("chunks", help="List semantic chunks from a scan (Phase 2 will read these as question-bank context).")
    chunks_parser.add_argument("scan_id", type=int, help="Scan ID.")
    chunks_parser.add_argument("--page-id", dest="page_id", type=int, default=None,
                               help="Restrict to a single page.")
    chunks_parser.add_argument("--limit", type=int, default=200, help="Max chunks to show.")

    gaps_parser = subparsers.add_parser("gaps", help="List heuristic content gaps for a scan.")
    gaps_parser.add_argument("scan_id", type=int, help="Scan ID.")

    # --- Phase 5: Fix Generator ---
    fixes_parser = subparsers.add_parser("fixes", help="List generated fixes for a scan.")
    fixes_parser.add_argument("scan_id", type=int, help="Scan ID.")
    fixes_parser.add_argument("--status", type=str, default=None, help="Filter by status: pending | applied | dismissed.")

    fixes_gen_parser = subparsers.add_parser("fixes-generate", help="Generate (or regenerate) fixes for all gaps in a scan.")
    fixes_gen_parser.add_argument("scan_id", type=int, help="Scan ID.")
    fixes_gen_parser.add_argument("--force", action="store_true", help="Regenerate even if fixes already exist.")

    fix_show_parser = subparsers.add_parser("fix-show", help="Show full content of a specific fix.")
    fix_show_parser.add_argument("scan_id", type=int, help="Scan ID.")
    fix_show_parser.add_argument("fix_id", type=int, help="Fix ID.")

    fix_apply_parser = subparsers.add_parser("fix-apply", help="Mark a fix as applied.")
    fix_apply_parser.add_argument("scan_id", type=int, help="Scan ID.")
    fix_apply_parser.add_argument("fix_id", type=int, help="Fix ID.")

    fix_dismiss_parser = subparsers.add_parser("fix-dismiss", help="Dismiss a fix (hide from pending list).")
    fix_dismiss_parser.add_argument("scan_id", type=int, help="Scan ID.")
    fix_dismiss_parser.add_argument("fix_id", type=int, help="Fix ID.")

    # --- Phase 7: Score & History ---
    score_parser = subparsers.add_parser("score", help="Compute the AI visibility score for a scan.")
    score_parser.add_argument("scan_id", type=int, help="Scan ID.")

    history_parser = subparsers.add_parser("history", help="Show score history trend for a domain.")
    history_parser.add_argument("domain", type=str, help="Domain (e.g. example.com).")

    # --- Phase 6: SOV ---
    sov_parser = subparsers.add_parser("sov", help="Show share-of-voice comparison for a scan.")
    sov_parser.add_argument("scan_id", type=int, help="Scan ID.")

    sov_link_parser = subparsers.add_parser("sov-link", help="Link a competitor scan for SOV comparison.")
    sov_link_parser.add_argument("scan_id", type=int, help="Parent (target) scan ID.")
    sov_link_parser.add_argument("competitor_scan_id", type=int, help="Competitor scan ID.")
    sov_link_parser.add_argument("competitor_url", type=str, help="Competitor root URL.")

    # --- Phase 3: Multi-LLM Test ---
    test_parser = subparsers.add_parser("test", help="Run the multi-LLM test pipeline for a scan.")
    test_parser.add_argument("scan_id", type=int, help="Scan ID.")
    test_parser.add_argument("--brand", type=str, default="", help="Brand name to track in answers.")
    test_parser.add_argument("--domain", type=str, default="", help="Domain to track in citations.")

    args = parser.parse_args()
    
    # Determine base url
    if args.server:
        api_url = args.server.rstrip("/")
    else:
        api_url = f"http://localhost:{args.port}/api"
        
    if args.command == "scan":
        competitors = [c.strip() for c in args.competitors.split(",") if c.strip()]
        run_scan(api_url, args.url, competitors)
    elif args.command == "fix":
        run_fix(api_url)
    elif args.command == "status":
        run_status(api_url)
    elif args.command == "history":
        run_history(api_url, args.domain)
    elif args.command == "crawl":
        run_crawl(api_url, args.url,
                  max_pages=args.max_pages,
                  max_depth=args.max_depth,
                  delay_ms=args.delay_ms)
    elif args.command == "scans":
        run_scans_list(api_url, limit=args.limit)
    elif args.command == "scan-show":
        run_scan_show(api_url, args.id)
    elif args.command == "pages":
        run_pages_list(api_url, args.scan_id, args.page_type, args.limit)
    elif args.command == "chunks":
        run_chunks_list(api_url, args.scan_id, args.page_id, args.limit)
    elif args.command == "gaps":
        run_gaps_list(api_url, args.scan_id)
    elif args.command == "fixes":
        run_fixes_list(api_url, args.scan_id, args.status)
    elif args.command == "fixes-generate":
        run_fixes_generate(api_url, args.scan_id, args.force)
    elif args.command == "fix-show":
        run_fix_show(api_url, args.scan_id, args.fix_id)
    elif args.command == "fix-apply":
        run_fix_apply(api_url, args.scan_id, args.fix_id)
    elif args.command == "fix-dismiss":
        run_fix_dismiss(api_url, args.scan_id, args.fix_id)
    elif args.command == "score":
        run_score(api_url, args.scan_id)
    elif args.command == "sov":
        run_sov(api_url, args.scan_id)
    elif args.command == "sov-link":
        run_sov_link(api_url, args.scan_id, args.competitor_scan_id, args.competitor_url)
    elif args.command == "test":
        run_test(api_url, args.scan_id, args.brand, args.domain)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
