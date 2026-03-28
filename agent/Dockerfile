FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent code
COPY . .

# Content and labs are mounted as volumes at runtime
ENV CONTENT_DIR=/content
ENV LABS_DIR=/labs
ENV PORT=8000
ENV HOST=0.0.0.0

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
