FROM python:3.12-slim-bookworm AS core-build
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts/build_core.py scripts/build_core.py
COPY android-core android-core
RUN python scripts/build_core.py --test

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=core-build /app/android-core/build/android-core.jar android-core/build/android-core.jar
COPY *.py *.js *.css index.html ./
COPY android-resources.json build-version.json scan-console.html viop-ledger.html ./
COPY assets assets
COPY data data
ENV PYTHONUNBUFFERED=1 PORT=8000
EXPOSE 8000
CMD ["python", "server.py"]
