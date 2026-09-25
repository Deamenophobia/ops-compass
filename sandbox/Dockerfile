FROM python:3.12-alpine
ARG REVISION
ENV REVISION=${REVISION} PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
LABEL org.opencontainers.image.revision=${REVISION} ops-compass.managed=sandbox
WORKDIR /app
COPY server.py ./server.py
USER 65534:65534
EXPOSE 8080
CMD ["python", "server.py"]
