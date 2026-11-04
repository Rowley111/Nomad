"""Database configuration. Credentials never enter response bodies or logs."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def database_url(value: str) -> str:
    if value.startswith("postgres://"):
        return "postgresql+psycopg://" + value[len("postgres://") :]
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value[len("postgresql://") :]
    if not value.startswith(("postgresql+psycopg://", "sqlite://")):
        raise ValueError("DATABASE_URL: требуется PostgreSQL (SQLite только для тестов)")
    return value


def make_engine(url: str):
    url = database_url(url)
    kwargs = {"pool_pre_ping": True, "hide_parameters": True}
    if url.startswith("sqlite:"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


def session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)
