FROM python:3.11-bullseye

# Install Java and build tools
RUN apt-get update && apt-get install -y \
    default-jdk \
    g++ \
    procps \
    curl \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

# Set JAVA_HOME and JVM Memory Limits
ENV JAVA_HOME=/usr/lib/jvm/default-java
# Limit Java to 256MB to leave room for Python/Gunicorn in Railway's 512MB
ENV _JAVA_OPTIONS="-Xmx256m"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all files (including possible helper scripts)
COPY . .

EXPOSE 8080

CMD gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 4 --timeout 120 --access-logfile - --error-logfile - mpp_parser:app
