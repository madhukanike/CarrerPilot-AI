import hashlib
import hmac
import secrets


# PBKDF2-HMAC-SHA256 iteration count for password hashing.
ITERATIONS = 310_000


def hash_password(password: str, salt: str | None = None):
    """
    Hash a password using PBKDF2-HMAC-SHA256.

    Returns:
        (password_hash, password_salt)
    """

    if salt:
        salt_bytes = bytes.fromhex(salt)
    else:
        salt_bytes = secrets.token_bytes(16)

    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt_bytes,
        ITERATIONS,
    )

    return password_hash.hex(), salt_bytes.hex()


def verify_password(
    password: str,
    stored_hash: str,
    stored_salt: str,
):
    """
    Verify a password against its stored hash and salt.
    """

    candidate_hash, _ = hash_password(
        password,
        stored_salt,
    )

    return hmac.compare_digest(
        candidate_hash,
        stored_hash,
    )


def create_token():
    """
    Create a secure random session token.
    """

    return secrets.token_urlsafe(48)


def hash_token(token: str):
    """
    Hash a session token before storing it in SQLite.
    """

    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()