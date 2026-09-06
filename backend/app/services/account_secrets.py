"""Encryption helpers for account-scoped provider credentials.

Only ciphertext is persisted. AES-GCM authenticates both the encrypted value
and the owning user id, so a value copied to another account cannot be opened.
"""
from __future__ import annotations

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ..config import settings

_VERSION = "v1"
_CONTEXT = b"fastclip/account-api-keys/v1"


class SecretUnavailable(RuntimeError):
    """Raised when a stored credential is corrupted or cannot be decrypted."""


def _key() -> bytes:
    return hashlib.sha256(_CONTEXT + settings.secret_key.encode("utf-8")).digest()


def encrypt_api_key(user_id: str, api_key: str) -> str:
    value = api_key.strip()
    if not value:
        raise ValueError("La clé API ne peut pas être vide.")
    nonce = os.urandom(12)
    encrypted = AESGCM(_key()).encrypt(nonce, value.encode("utf-8"), user_id.encode("utf-8"))
    return ".".join(
        (
            _VERSION,
            base64.urlsafe_b64encode(nonce).decode("ascii").rstrip("="),
            base64.urlsafe_b64encode(encrypted).decode("ascii").rstrip("="),
        )
    )


def decrypt_api_key(user_id: str, stored: str | None) -> str | None:
    if not stored:
        return None
    try:
        version, nonce_raw, encrypted_raw = stored.split(".", 2)
        if version != _VERSION:
            raise ValueError("unsupported version")
        nonce = base64.urlsafe_b64decode(nonce_raw + "=" * (-len(nonce_raw) % 4))
        encrypted = base64.urlsafe_b64decode(
            encrypted_raw + "=" * (-len(encrypted_raw) % 4)
        )
        plaintext = AESGCM(_key()).decrypt(
            nonce, encrypted, user_id.encode("utf-8")
        )
        return plaintext.decode("utf-8")
    except Exception as exc:
        raise SecretUnavailable(
            "La clé API enregistrée ne peut pas être lue. Enregistre-la de nouveau."
        ) from exc


def masked_api_key(user_id: str, stored: str | None) -> str | None:
    value = decrypt_api_key(user_id, stored)
    if not value:
        return None
    return f"••••••••{value[-4:]}"
