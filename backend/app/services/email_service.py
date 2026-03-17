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
    smtp_user = settings.SMTP_USER or settings.MAIL_USERNAME
    smtp_password = settings.SMTP_PASSWORD or settings.MAIL_PASSWORD
    smtp_host = settings.SMTP_HOST
    from_email = settings.EMAILS_FROM_EMAIL or smtp_user

    if smtp_user is None:
        print("---------------------------------------------------------")
        print(f"[{settings.PROJECT_NAME}] DEV MODE - OTP for {to_email}: {otp}")
        print("---------------------------------------------------------")
        return

    try:
        missing = []
        if not smtp_host:
            missing.append("SMTP_HOST")
        if smtp_password is None:
            missing.append("SMTP_PASSWORD")
        if from_email is None:
            missing.append("EMAILS_FROM_EMAIL")

        if missing:
            raise RuntimeError(
                f"Missing required SMTP settings for production mode: {', '.join(missing)}"
            )

        msg = MIMEMultipart()
        msg["From"] = f"{settings.EMAILS_FROM_NAME} <{from_email}>"
        msg["To"] = to_email
        msg["Subject"] = "Your Verification Code"

        body = f"Your verification code for {settings.PROJECT_NAME} is: {otp}\n\nThis code expires in {settings.OTP_EXPIRE_MINUTES} minutes."
        msg.attach(MIMEText(body, "plain"))

        server = smtplib.SMTP(smtp_host, settings.SMTP_PORT)
        if settings.SMTP_TLS:
            server.starttls()
        
        server.login(smtp_user, smtp_password)
        server.sendmail(str(from_email), to_email, msg.as_string())
        server.quit()
    except Exception as exc:
        logger.exception("Failed to send OTP email to %s", to_email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send OTP email",
        ) from exc
