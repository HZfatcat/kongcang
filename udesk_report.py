#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Udesk 客服报表工具 —— 通话统计 + 业务记录（含问题类型）

功能:
  call-stats       通话总览统计（自动翻页，与 Udesk 后台报表对齐）
  notes-with-type  业务记录列表，问题类型按级联字段逐级展开
  field-options    查看自定义字段选项树（调试用）

依赖:  pip install requests
可选:  pip install python-dotenv

环境变量（可选，有内置默认值）:
  UDESK_BASE_URL   租户地址，如 https://xxx.udesk.cn
  UDESK_EMAIL      登录邮箱
  UDESK_PASSWORD   登录密码
  UDESK_TOKEN      直接传 Token（有则跳过 log_in）
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import sys
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


# ── 内置默认租户 ──────────────────────────────────────────────
_DEFAULT_SUBDOMAIN = "gitcode.s2"
_DEFAULT_EMAIL = "chenjc@csdn.net"
_DEFAULT_PASSWORD = "gitcode001"
_DEFAULT_BASE_URL = f"https://{_DEFAULT_SUBDOMAIN}.udesk.cn"

UDESK_BASE_URL = os.getenv("UDESK_BASE_URL", _DEFAULT_BASE_URL).rstrip("/")
UDESK_EMAIL = os.getenv("UDESK_EMAIL", _DEFAULT_EMAIL)
UDESK_PASSWORD = os.getenv("UDESK_PASSWORD", _DEFAULT_PASSWORD)
UDESK_SIGN_VERSION = os.getenv("UDESK_SIGN_VERSION", "v2")

_runtime_token: Optional[str] = None
TIMEOUT = 30


# ── 认证 ──────────────────────────────────────────────────────
def _die(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(1)


def _parse_token(data: dict) -> Optional[str]:
    if data.get("code") != 1000:
        return None
    tok = (
        data.get("open_api_auth_token")
        or data.get("token")
        or data.get("open_api_token")
    )
    if not tok and isinstance(data.get("admin"), dict):
        tok = data["admin"].get("open_api_auth_token") or data["admin"].get("token")
    return str(tok) if tok else None


def ensure_token() -> str:
    """获取 Open API Token（优先环境变量，否则自动登录换取）。"""
    global _runtime_token
    env_tok = os.getenv("UDESK_TOKEN", "").strip()
    if env_tok:
        return env_tok
    if _runtime_token:
        return _runtime_token
    if not UDESK_EMAIL or not UDESK_PASSWORD:
        _die("需要 UDESK_EMAIL + UDESK_PASSWORD，或设置 UDESK_TOKEN")
    r = requests.post(
        f"{UDESK_BASE_URL}/open_api_v1/log_in",
        json={"email": UDESK_EMAIL, "password": UDESK_PASSWORD},
        timeout=TIMEOUT,
    )
    data = r.json()
    tok = _parse_token(data)
    if not tok:
        _die(f"log_in 失败: {json.dumps(data, ensure_ascii=False)}")
    _runtime_token = tok
    return tok


def _signed_url(path: str, extra: Optional[Dict[str, Any]] = None) -> str:
    """拼接 open_api_v1 签名 URL。"""
    token = ensure_token()
    ts = str(int(time.time()))
    nonce = secrets.token_hex(16)
    raw = f"{UDESK_EMAIL}&{token}&{ts}&{nonce}&{UDESK_SIGN_VERSION}"
    sign = hashlib.sha256(raw.encode()).hexdigest()
    params: Dict[str, str] = {
        "email": UDESK_EMAIL,
        "timestamp": ts,
        "nonce": nonce,
        "sign": sign,
        "sign_version": UDESK_SIGN_VERSION,
    }
    if extra:
        for k, v in extra.items():
            if v is not None:
                params[str(k)] = str(v)
    path = path.lstrip("/")
    if not path.startswith("open_api_v1/"):
        path = "open_api_v1/" + path
    return f"{UDESK_BASE_URL}/{path}?{urlencode(params)}"


# ── 级联字段解析 ──────────────────────────────────────────────
def load_field_tree(field_id: str) -> list:
    """加载自定义字段选项树，返回原始树结构。"""
    url = _signed_url(f"custom_fields/{field_id}")
    r = requests.get(url, timeout=TIMEOUT)
    if r.status_code != 200:
        return []
    data = r.json()
    if data.get("code") != 1000:
        return []
    field = data.get("field") or (data.get("fields", [None]) or [None])[0]
    return field.get("options", []) if field else []


def parse_cascade(value_str: str, tree: list) -> list:
    """沿选项树逐级解析级联值，返回每级标题列表。

    示例: '15,1' + 树 → ['主动回访', 'IM在线咨询回访']
    """
    if not value_str:
        return []
    parts = [p.strip() for p in value_str.split(",")]
    result, level = [], tree
    for part in parts:
        if not level:
            result.append(f"[{part}]")
            continue
        found = False
        for opt in level:
            if str(opt.get("value", "")) == part:
                result.append(opt.get("title", f"[{part}]"))
                level = opt.get("subs", [])
                found = True
                break
        if not found:
            result.append(f"[{part}]")
            level = []
    return result


# ── 通话统计 ──────────────────────────────────────────────────
def _fetch_call_logs(
    start_time: str, end_time: str,
    customer_phone: Optional[str] = None,
) -> Optional[list]:
    """拉取一个时间段内的全部通话记录（自动翻页）。失败返回 None。"""
    extra: Dict[str, Any] = {
        "start_time": start_time,
        "end_time": end_time,
        "page": 1,
        "page_size": 30,
    }
    if customer_phone:
        extra["customer_phone"] = customer_phone

    all_items: list = []
    page = 1
    while True:
        extra["page"] = page
        r = requests.get(_signed_url("callcenter/calllogs", extra), timeout=TIMEOUT)
        if r.status_code != 200:
            print(f"请求失败: HTTP {r.status_code}")
            return None
        data = r.json()
        if data.get("code") != 1000:
            print(f"API错误: {data.get('message', '')}")
            return None
        items = data.get("items", [])
        if not items:
            break
        all_items.extend(items)
        if len(all_items) >= data.get("total", 0):
            break
        page += 1

    return all_items


def _chunk_date_range(start_str: str, end_str: str, max_days: int = 28):
    """将日期范围按 max_days 天分割成子段。"""
    fmt = "%Y-%m-%d %H:%M:%S"
    start = datetime.strptime(start_str, fmt)
    end = datetime.strptime(end_str, fmt)
    chunks = []
    cur = start
    while cur < end:
        chunk_end = min(cur + timedelta(days=max_days), end)
        chunks.append((cur.strftime(fmt), chunk_end.strftime(fmt)))
        cur = chunk_end
    return chunks


def _compute_and_output(all_items: list, args: argparse.Namespace) -> int:
    """对拉取到的全部记录进行统计并输出（终端 + JSON 文件）。"""
    if not all_items:
        print("无通话记录")
        return 0

    inbound = [x for x in all_items if x.get("call_type") == "呼入"]
    outbound = [x for x in all_items if x.get("call_type") == "呼出"]
    in_conn = [x for x in inbound if x.get("call_result") == "客服接听"]
    out_conn = [x for x in outbound if x.get("call_result") == "客户接听"]
    in_ring = [x for x in inbound if (x.get("ring_time") or 0) > 0]

    def _is_rated(s: str) -> bool:
        return "已评价" in s and "未评价" not in s

    def _is_satisfied(s: str) -> bool:
        return "满意" in s and "不满意" not in s

    def _calc(records, connected, label):
        cnt = len(records)
        conn_cnt = len(connected)
        total_t = sum(x.get("call_time", 0) or 0 for x in connected)
        avg_t = round(total_t / conn_cnt, 1) if conn_cnt else 0
        rated = [x for x in records if _is_rated(x.get("survey", ""))]
        sat = len([x for x in rated if _is_satisfied(x.get("survey", ""))])
        sat_rate = f"{sat / len(rated) * 100:.2f}%" if rated else "N/A"
        return {
            f"{label}数": cnt,
            f"{label}接通数": conn_cnt,
            f"{label}通话总时长(秒)": total_t,
            f"{label}通话平均时长(秒)": avg_t,
            f"{label}参评数": len(rated),
            f"{label}满意度": sat_rate,
        }

    stats: dict = {}
    stats.update(_calc(inbound, in_conn, "呼入"))
    stats.update(_calc(outbound, out_conn, "呼出"))
    stats["总通话数"] = len(all_items)
    stats["呼入振铃数"] = len(in_ring)
    stats["呼入接通率"] = f"{len(in_conn) / len(in_ring) * 100:.1f}%" if in_ring else "N/A"

    end_disp = args.end_time or "至今"
    print("=" * 50)
    print(f"统计周期: {args.start_time} ~ {end_disp}")
    print(f"总记录数: {len(all_items)}")
    print("=" * 50)
    for k, v in stats.items():
        print(f"{k:.<30} {v}")
    print("=" * 50)

    # 输出 JSON
    if args.json_path:
        def _satisfaction_label(item):
            s = item.get("survey", "")
            if _is_rated(s):
                return "满意" if _is_satisfied(s) else "不满意"
            return "未评价"

        records_out = []
        for item in all_items:
            records_out.append({
                "id": item.get("id"),
                "call_type": item.get("call_type"),
                "call_result": item.get("call_result"),
                "customer_phone": item.get("call_number") or item.get("customer_phone") or "",
                "agent_name": item.get("agent_nick_name") or item.get("agent_name") or "",
                "call_time": item.get("call_time", 0),
                "ring_time": item.get("ring_time", 0),
                "start_time": item.get("call_start_at") or item.get("start_time") or "",
                "satisfaction": _satisfaction_label(item),
                "survey": item.get("survey", ""),
            })

        output = {
            "period": {"start": args.start_time, "end": end_disp},
            "stats": stats,
            "records": records_out,
        }
        os.makedirs(os.path.dirname(os.path.abspath(args.json_path)), exist_ok=True)
        with open(args.json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"JSON 已输出: {args.json_path}")

    return 0


def cmd_call_stats(args: argparse.Namespace) -> int:
    """拉取全部通话记录（自动翻页），输出总览指标。"""
    # 自动分片：当时间跨度超过 28 天时，拆分成多个段拉取
    if args.end_time:
        fmt = "%Y-%m-%d %H:%M:%S"
        try:
            start_dt = datetime.strptime(args.start_time, fmt)
            end_dt = datetime.strptime(args.end_time, fmt)
            if (end_dt - start_dt).days > 28:
                chunks = _chunk_date_range(args.start_time, args.end_time)
                total_chunks = len(chunks)
                print(f"⏳ 时间跨度 {(end_dt - start_dt).days} 天 > 28 天，自动分 {total_chunks} 片拉取...")
                all_items: list = []
                for i, (cs, ce) in enumerate(chunks, 1):
                    print(f"  分片 {i}/{total_chunks}: {cs} ~ {ce}")
                    items = _fetch_call_logs(cs, ce, args.customer_phone)
                    if items is None:
                        return 1
                    all_items.extend(items)
                # 按 id 去重
                seen = set()
                deduped = []
                for item in all_items:
                    iid = item.get("id")
                    if iid and iid not in seen:
                        seen.add(iid)
                        deduped.append(item)
                all_items = deduped
                print(f"  合并去重后共 {len(all_items)} 条唯一记录")
                # 跳过原始单次拉取逻辑，直接进入统计输出
                return _compute_and_output(all_items, args)
        except ValueError:
            pass  # 日期格式异常，降级为不分片

    # 单次拉取（原始逻辑）
    extra: Dict[str, Any] = {
        "start_time": args.start_time,
        "end_time": args.end_time,
        "page": 1,
        "page_size": 30,
    }
    if args.customer_phone:
        extra["customer_phone"] = args.customer_phone

    all_items: list = []
    page = 1
    while True:
        extra["page"] = page
        r = requests.get(_signed_url("callcenter/calllogs", extra), timeout=TIMEOUT)
        if r.status_code != 200:
            print(f"请求失败: HTTP {r.status_code}")
            return 1
        data = r.json()
        if data.get("code") != 1000:
            print(f"API错误: {data.get('message', '')}")
            return 1
        items = data.get("items", [])
        if not items:
            break
        all_items.extend(items)
        if len(all_items) >= data.get("total", 0):
            break
        page += 1

    if not all_items:
        print("无通话记录")
        return 0

    return _compute_and_output(all_items, args)


# ── 业务记录 + 问题类型 ───────────────────────────────────────
def cmd_notes_with_type(args: argparse.Namespace) -> int:
    """查询业务记录，问题类型按级联字段逐级展开为独立列。"""
    field_id = "SelectField_19997"
    tree = load_field_tree(field_id)
    if not tree:
        print(f"警告: 无法加载字段 {field_id} 的选项", file=sys.stderr)

    extra: Dict[str, Any] = {
        "page": args.page,
        "per_page": args.per_page,
    }
    if args.start_date:
        extra["start_date"] = args.start_date
    if args.end_date:
        extra["end_date"] = args.end_date
    if args.category:
        extra["category"] = args.category

    r = requests.get(_signed_url("notes", extra), timeout=TIMEOUT)
    if r.status_code != 200:
        print(f"请求失败: HTTP {r.status_code}")
        return 1
    data = r.json()
    if data.get("code") != 1000:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 1

    records = data.get("note_record", [])
    meta = data.get("meta", {})
    if not records:
        print("无业务记录")
        return 0

    print(f"共 {meta.get('total_records', 0)} 条 | 第 {meta.get('current_page', 1)}/{meta.get('total_pages', 1)} 页")
    print("=" * 120)
    print(f"{'ID':<12} {'时间':<20} {'客服':<10} {'客户':<20} {'问题类型_1':<15} {'问题类型_2':<20} {'问题类型_3':<20}")
    print("-" * 120)

    for rec in records:
        rid = rec.get("id", "")
        ts = rec.get("created_at", "")[:19]
        agent = rec.get("agent_nick_name", "")
        cust = rec.get("customer_nick_name", "")
        raw = rec.get("custom_fields", {}).get(field_id, "")
        lvls = parse_cascade(raw, tree) if tree else []
        t1 = lvls[0] if len(lvls) > 0 else ""
        t2 = lvls[1] if len(lvls) > 1 else ""
        t3 = lvls[2] if len(lvls) > 2 else ""
        print(f"{rid:<12} {ts:<20} {agent:<10} {cust:<20} {t1:<15} {t2:<20} {t3:<20}")

    print("=" * 120)
    return 0


# ── 字段选项查看（调试） ──────────────────────────────────────
def cmd_field_options(args: argparse.Namespace) -> int:
    """打印自定义字段的选项树。"""
    fid = args.field_id.lstrip("/")
    url = _signed_url(f"custom_fields/{fid}")
    r = requests.get(url, timeout=TIMEOUT)
    data = r.json()
    if data.get("code") != 1000:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 1
    field = data.get("field") or (data.get("fields", [None]) or [None])[0]
    if not field:
        print(f"未找到字段: {fid}")
        return 1
    print(f"字段: {field.get('field_name')} ({field.get('field_label')})  类型: {field.get('content_type')}\n")

    def _print(opts, level=0):
        for opt in opts:
            prefix = "  " * level
            hide = " [隐藏]" if opt.get("is_hide") else ""
            print(f"{prefix}[{opt.get('value', '')}] {opt.get('title', '')}{hide}")
            _print(opt.get("subs", []), level + 1)

    _print(field.get("options", []))
    return 0


# ── CLI ───────────────────────────────────────────────────────
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Udesk 客服报表工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 通话统计（5月）
  python udesk_report.py call-stats --start-time "2026-05-01 00:00:00" --end-time "2026-05-31 23:59:59"

  # 业务记录 + 问题类型
  python udesk_report.py notes-with-type --start-date 2026-05-27 --end-date 2026-05-27

  # 只看 IM 类型记录
  python udesk_report.py notes-with-type --start-date 2026-05-27 --end-date 2026-05-27 --category im

  # 查看字段选项树
  python udesk_report.py field-options SelectField_19997
""",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    # call-stats
    s = sub.add_parser("call-stats", help="通话总览统计（自动翻页）")
    s.add_argument("--start-time", required=True, dest="start_time", help="起始时间 YYYY-MM-DD hh:mm:ss")
    s.add_argument("--end-time", default=None, dest="end_time", help="结束时间（默认至今）")
    s.add_argument("--customer-phone", dest="customer_phone", default=None, help="按客户电话筛选")
    s.add_argument("--json", default=None, dest="json_path", help="输出 JSON 文件路径（含原始记录和统计指标）")
    s.set_defaults(func=cmd_call_stats)

    # notes-with-type
    s = sub.add_parser("notes-with-type", help="业务记录 + 问题类型")
    s.add_argument("--start-date", dest="start_date", default=None, help="起始日期 YYYY-MM-DD")
    s.add_argument("--end-date", dest="end_date", default=None, help="结束日期 YYYY-MM-DD")
    s.add_argument("--category", choices=("im", "call"), default=None, help="业务类型筛选")
    s.add_argument("--page", type=int, default=1)
    s.add_argument("--per-page", type=int, default=50, dest="per_page", help="每页条数（最大50）")
    s.set_defaults(func=cmd_notes_with_type)

    # field-options
    s = sub.add_parser("field-options", help="查看自定义字段选项树（调试）")
    s.add_argument("field_id", help="字段标识，如 SelectField_19997")
    s.set_defaults(func=cmd_field_options)

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
