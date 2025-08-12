# Pulse: A Lightweight Heartbeat Monitoring Service

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)
![Platform](https://img.shields.io/badge/Platform-Docker-blue.svg)

Pulse is a simple, high-performance, self-hosted monitoring service designed to keep track of your scheduled tasks, cron jobs, and background services. It works by listening for "heartbeats"—HTTP requests from your jobs. If a heartbeat doesn't arrive on schedule, Pulse marks the check as "down" and can alert you.

It provides a clean web interface, Prometheus metrics for observability, and optional webhook notifications for status reporting.

## Features

- **Simple Status Dashboard:** A clean, responsive UI to view the status of all your monitored checks at a glance.
- **Cron-like Scheduling:** Define how often you expect a ping (e.g., every 5 minutes, once a day).
- **Grace Periods:** Configure a grace period to prevent false alarms for jobs that run slightly off-schedule.
- **Prometheus Metrics:** Exposes a `/metrics` endpoint for easy integration with your existing Prometheus and Grafana observability stack.
- **Webhook Notifications:** Can send scheduled summary reports with a payload format tailored for **Google Chat**.
- **Secure by Default:** Uses `HttpOnly`, `Secure` session cookies and constant-time secret comparison to prevent timing attacks.
- **Lightweight & Fast:** Built on Fastify and SQLite, ensuring low resource usage and high throughput.
- **Containerized:** Includes a multi-stage `Dockerfile` for building a small, secure production image.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/) (version 20.x or later)
- [npm](https://www.npmjs.com/)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/pulse-monitoring-service.git](https://github.com/your-username/pulse-monitoring-service.git)
    cd pulse-monitoring-service
    ```

2.  **Install dependencies:**
    This will install all necessary packages, including `pino-pretty` for readable development logs.
    ```bash
    npm install
    ```

3.  **Configure your environment:**
    Copy the example environment file and edit it with your own settings.
    ```bash
    cp .env.example .env
    ```
    Now, open the `.env` file and customize the variables.

### Configuration

The `.env` file contains all the configuration options for the application.

| Variable         | Description                                                                                                                              | Default                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `PORT`           | The port the service will run on.                                                                                                        | `8080`                                        |
| `APP_TITLE`      | A descriptive title for the web UI header.                                                                                               | `Pulse Monitor`                               |
| `ADMIN_SECRET`   | A secret key for administrative login to create/delete checks. **Change this for production.** | `change-this-super-secret-key`                |
| `SESSION_SECRET` | A cryptographically secure secret for signing session cookies. **Change this for production.** Use `openssl rand -base64 32` to generate one. | `change-this-very-strong-session-secret`      |
| `WEBHOOK_URL`    | (Optional) A webhook URL for a **Google Chat space** to send scheduled status reports.                                                 | `""` (disabled)                               |
| `WEBHOOK_SCHEDULE`| The cron schedule for sending the status report webhook.                                                                                 | `0 9 * * 1-5` (9 AM, Mon-Fri)                 |
| `CRON_TIMEZONE`  | The timezone for all cron schedules (e.g., `America/New_York`, `Europe/London`). A list can be found on [Wikipedia](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones). | `Asia/Jakarta` |

## Running the Application

- **For Development:**
  The following command starts the server with `nodemon`-like watch functionality, automatically restarting on file changes. Logs will be colorized and human-readable.
  ```bash
  npm run dev
  ````

- **For Production:**
  This command starts the server in production mode. Ensure your `.env` file is configured with secure secrets.
  ```bash
  npm start
  ```

The application will be available at `http://localhost:8080` (or the port you specified).

## Running with Docker

The included `Dockerfile` allows you to run Pulse in a containerized environment, which is the recommended method for production deployment.

1.  **Build the Docker image:**

    ```bash
    docker build -t pulse-monitor .
    ```

2.  **Run the Docker container:**
    This command runs the container in detached mode, maps the port, mounts a volume for persistent data, and passes the `.env` file for configuration.

    ```bash
    docker run -d \
      -p 8080:8080 \
      --name pulse \
      -v $(pwd)/data:/usr/src/app/data \
      --env-file .env \
      pulse-monitor
    ```

    - `-d`: Run in detached mode (in the background).
    - `-p 8080:8080`: Map port 8080 on the host to port 8080 in the container.
    - `--name pulse`: Give the container a memorable name.
    - `-v $(pwd)/data:/usr/src/app/data`: Persist the SQLite database to a `data` directory on the host machine.
    - `--env-file .env`: Pass your configuration variables to the container.

## How to Use Pulse

### 1\. Create a Check

- Click the "Add New Check" button in the UI.
- **Name:** A human-readable name for your job (e.g., "Daily Database Backup").
- **Schedule:** How often you expect the job to run and send a ping. Examples: `30m` (30 minutes), `1h` (1 hour), `1d` (1 day).
- **Grace Period:** A short additional time to wait before marking the job as "down." This prevents false alarms if a job runs a few seconds late. Example: `5m`.

### 2\. Ping the URL

After creating a check, the UI will display a unique **Ping URL** for it:
`http://<your-server-address>/ping/<uuid>`

Modify your script or cron job to send an HTTP GET request to this URL on successful completion.

**Example using `curl`:**

```bash
# Your main script logic here
# ...

# If the script succeeds, send the heartbeat
curl --retry 3 http://localhost:8080/ping/your-unique-uuid
```

You can also report the job's duration in milliseconds using the `duration` query parameter:

```bash
curl http://localhost:8080/ping/your-unique-uuid?duration=1250
```

### Check Statuses

- **New:** A newly created check that has never been pinged.
- **Up:** The check has received a ping within its scheduled time + grace period.
- **Down:** The check has not received a ping within its scheduled time + grace period.
- **Maintenance:** The check is temporarily paused. It will not be marked as "down" and pings will be ignored.
- **Failed:** The check has been explicitly marked as failed by an admin via the UI.

### Observability

- **Prometheus:** Point your Prometheus scraper to the `/metrics` endpoint to collect detailed gauges for each check's status, last ping time, and duration.
- **Webhooks:** Configure the `WEBHOOK_URL` and `WEBHOOK_SCHEDULE` to receive periodic summaries. The current implementation's payload is formatted specifically for **Google Chat**.

## Technology Stack

- **Backend:** [Fastify](https://www.fastify.io/), [Node.js](https://nodejs.org/)
- **Database:** [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Frontend:** Vanilla JavaScript (ESM), CSS
- **Containerization:** [Docker](https://www.docker.com/)
- **Scheduling:** [Croner](https://github.com/Hexagon/croner)
- **Metrics:** [prom-client](https://github.com/siimon/prom-client)

## License

This project is licensed under the MIT License.
