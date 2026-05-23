from fastapi import Depends, Header, HTTPException

from app.db.supabase import get_supabase, run_threaded_with_retry


async def get_current_user(
    authorization: str = Header(...),
    supabase=Depends(get_supabase),
) -> dict:
    token = authorization.removeprefix("Bearer ").strip()
    response = await run_threaded_with_retry(lambda: supabase.auth.get_user(token))
    if not response.user:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Invalid or expired token",
                    "details": None,
                }
            },
        )

    user = response.user
    user_id = user.id
    email = user.email
    display_name = None
    metadata = getattr(user, "user_metadata", None) or {}
    if isinstance(metadata, dict):
        display_name = metadata.get("display_name") or metadata.get("name")

    await run_threaded_with_retry(
        lambda: supabase.table("users")
        .upsert(
            {"id": user_id, "email": email, "display_name": display_name},
            on_conflict="id",
        )
        .execute()
    )
    return user
