"""Private operator commands; never run migrations automatically."""

import argparse
import getpass
import os
import re
import uuid

from sqlalchemy import select

from .database import make_engine, session_factory
from .models import User
from .security import password_hash


def main():
    parser = argparse.ArgumentParser(description="Nomad Mobile: управление доступом на сервере")
    parser.add_argument("command", choices=["create-admin", "create-user"])
    parser.add_argument("--role", choices=["admin", "staff"], default="staff")
    args = parser.parse_args()
    url = os.environ.get("DATABASE_URL")
    if not url:
        parser.exit(1, "Укажите DATABASE_URL только в серверном окружении\n")
    username = (os.environ.get("NOMAD_ADMIN_USERNAME") or input("Логин: ")).strip().casefold()
    if not re.fullmatch(r"[\w.-]{3,80}", username):
        parser.exit(1, "Логин: 3–80 букв/цифр, точка, подчёркивание или дефис\n")
    password = os.environ.get("NOMAD_ADMIN_PASSWORD") or getpass.getpass("Пароль (минимум 12 символов): ")
    if not os.environ.get("NOMAD_ADMIN_PASSWORD") and password != getpass.getpass("Повторите пароль: "):
        parser.exit(1, "Пароли не совпадают\n")
    try:
        hashed = password_hash(password)
        engine = make_engine(url)
        with session_factory(engine)() as db:
            if db.scalar(select(User).where(User.username == username)):
                parser.exit(1, "Такой пользователь уже существует. Пароль не изменён\n")
            db.add(User(id=uuid.uuid4().hex, username=username, password_hash=hashed, role="admin" if args.command == "create-admin" else args.role))
            db.commit()
        engine.dispose()
    except ValueError as exc:
        parser.exit(1, str(exc) + "\n")
    except Exception:
        # Database-driver errors must not expose credentials in a public console log.
        parser.exit(1, "Создать пользователя не удалось. Проверьте подключение и миграции на сервере\n")
    print("Пользователь создан. Удалите переменную одноразового пароля из окружения.")


if __name__ == "__main__":
    main()
