import os

from alembic import context
from server.database import make_engine
from server.models import Base

config = context.config
target_metadata = Base.metadata


def run_migrations():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("Укажите DATABASE_URL в серверном окружении")
    if url.startswith("sqlite:") and os.environ.get("NOMAD_ALLOW_SQLITE") != "1":
        raise RuntimeError("SQLite разрешён только для локальной проверки NOMAD_ALLOW_SQLITE=1")
    engine = make_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_migrations()
