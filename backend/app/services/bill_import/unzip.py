"""账单压缩包解包。

微信支付账单 zip：ZipCrypto 加密、单条目、压缩方式 deflate，
密码是 6 位数字（微信支付公众号下发）。这里先尝试用户提供的密码，
失败或未提供时直接穷举 6 位数字——对使用者来说不需要输入任何密码。
"""

from __future__ import annotations

import io
import zipfile
import zlib

from .crack import crack_numeric, decrypt_stream

# 10^6 之外的空间不尝试（6 位数字的上限）
MAX_DIGITS = 6


class BillUnlockError(Exception):
    """压缩包无法解开（不是 zip、密码不对、内容损坏）。"""


def _dos_time_high(info: zipfile.ZipInfo) -> int:
    _, _, _, hour, minute, second = info.date_time
    return (((hour << 11) | (minute << 5) | (second // 2)) >> 8) & 0xFF


def _data_offset(raw: bytes, info: zipfile.ZipInfo) -> int:
    offset = info.header_offset
    if raw[offset : offset + 4] != b"PK\x03\x04":
        raise BillUnlockError("压缩包结构异常")
    name_len = int.from_bytes(raw[offset + 26 : offset + 28], "little")
    extra_len = int.from_bytes(raw[offset + 28 : offset + 30], "little")
    return offset + 30 + name_len + extra_len


def _decrypt_entry(raw: bytes, info: zipfile.ZipInfo, password: str) -> bytes:
    start = _data_offset(raw, info)
    cipher = raw[start : start + info.compress_size]
    plain = decrypt_stream(cipher, password)
    try:
        if info.compress_type == zipfile.ZIP_DEFLATED:
            data = zlib.decompress(plain, -15)
        elif info.compress_type == zipfile.ZIP_STORED:
            data = plain
        else:
            raise BillUnlockError("不支持的压缩方式")
    except zlib.error as exc:
        raise BillUnlockError("解压失败") from exc
    if len(data) != info.file_size:
        raise BillUnlockError("解压长度不符")
    if (zlib.crc32(data) & 0xFFFFFFFF) != info.CRC:
        raise BillUnlockError("校验失败")
    return data


def _is_zip(data: bytes) -> bool:
    return data[:4] == b"PK\x03\x04" or data[:2] == b"PK"


def unpack(data: bytes, password: str | None = None) -> tuple[bytes, str]:
    """返回 (解包后的文件内容, 原文件名)。非 zip 输入原样返回。"""
    if not _is_zip(data):
        return data, ""

    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return data, ""

    # xlsx 本身也是 zip：含 workbook 时原样返回，别把内部 XML 当账单
    if "xl/workbook.xml" in archive.namelist():
        return data, ""

    infos = [i for i in archive.infolist() if not i.is_dir()]
    if not infos:
        raise BillUnlockError("压缩包里没有文件")
    info = infos[0]

    encrypted = bool(info.flag_bits & 0x1)
    if not encrypted:
        return archive.read(info), info.filename

    if password:
        try:
            return _decrypt_entry(data, info, password), info.filename
        except BillUnlockError:
            pass  # 落到穷举

    if info.compress_type not in (zipfile.ZIP_DEFLATED, zipfile.ZIP_STORED):
        raise BillUnlockError("不支持的压缩方式，请提供密码")

    start = _data_offset(data, info)
    cipher = data[start : start + info.compress_size]
    checks = (_dos_time_high(info), (info.CRC >> 24) & 0xFF)
    found = crack_numeric(
        cipher,
        info.CRC,
        info.file_size,
        info.compress_type,
        length=MAX_DIGITS,
        checks=checks,
    )
    if found is None:
        raise BillUnlockError("无法解开压缩包：密码不是 6 位数字，请手动填写")
    return _decrypt_entry(data, info, found), info.filename
