"""从账单邮件里的下载链接取文件。

微信支付的账单邮件没有附件，正文里是一条带签名的下载链接
（tenpay.wechatpay.cn/...downloadfilefromemail?...），无 Cookie 也能下。
链接有时效，过期会返回 403/404，需要提示用户重新申请。
"""

from __future__ import annotations

import urllib.error
import urllib.request

from .client import MailError

MAX_BYTES = 20 * 1024 * 1024
TIMEOUT_SECONDS = 30
USER_AGENT = "Mozilla/5.0 (Linux; Android 14) ShiguangBillImport/1.0"


def download_bill(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            data = response.read(MAX_BYTES + 1)
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403, 404, 410):
            raise MailError("账单下载链接已失效，请重新在微信里申请账单") from exc
        raise MailError(f"下载账单失败（HTTP {exc.code}）") from exc
    except OSError as exc:
        raise MailError("下载账单失败，请检查服务器网络") from exc

    if len(data) > MAX_BYTES:
        raise MailError("账单文件过大（上限 20MB）")
    if data[:2] != b"PK":
        raise MailError("下载到的不是账单文件（链接可能已过期）")
    return data
