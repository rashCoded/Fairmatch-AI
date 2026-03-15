import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

def send_otp_email(to_email: str, otp: str):
    """
    Sends an OTP email to the user.
    If SMTP_USER is not configured in settings, it prints the OTP to the console
    for development purposes.
    """
    if settings.SMTP_USER is None:
        print("---------------------------------------------------------")
        print(f"[{settings.PROJECT_NAME}] DEV MODE - OTP for {to_email}: {otp}")
        print("---------------------------------------------------------")
        return

    try:
        missing = []
        if not settings.SMTP_HOST:
            missing.append("SMTP_HOST")
        if settings.SMTP_PASSWORD is None:
            missing.append("SMTP_PASSWORD")
        if settings.EMAILS_FROM_EMAIL is None:
            missing.append("EMAILS_FROM_EMAIL")

        if missing:
            raise RuntimeError(
                f"Missing required SMTP settings for production mode: {', '.join(missing)}"
            )

        msg = MIMEMultipart()
        msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
        msg["To"] = to_email
        msg["Subject"] = "Your Verification Code"

        body = f"Your verification code for {settings.PROJECT_NAME} is: {otp}\n\nThis code expires in {settings.OTP_EXPIRE_MINUTES} minutes."
        msg.attach(MIMEText(body, "plain"))

        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        if settings.SMTP_TLS:
            server.starttls()
        
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.EMAILS_FROM_EMAIL, to_email, msg.as_string())
        server.quit()
    except Exception as exc:
        logger.exception("Failed to send OTP email to %s", to_email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send OTP email",
        ) from exc
