# morty

## TODO:

- [] Figure out deployment strategy
- [] build front end to show logs and other stuff
- [] implement crypto watchlist
- [] add twitter character and integration

## Deployment

### Option 1: Railway (Recommended)

1. Create a Railway account
2. Create a new project
3. Add PostgreSQL plugin
4. Configure environment variables:
   ```
   DISCORD_TOKEN=your_token
   DISCORD_CLIENT_ID=your_client_id
   OPENROUTER_API_KEY=your_key
   DATABASE_URL=provided_by_railway
   ```
5. Connect your GitHub repository
6. Deploy

## Run with Docker

### Build and run Docker Compose (For x86_64 architecture)

#### Edit the docker-compose.yaml file with your environment variables

```yaml
services:
  eliza:
    environment:
      - OPENROUTER_API_KEY=blahdeeblahblahblah
```

#### Run the image

```bash
docker compose up
```

### Build the image with Mac M-Series or aarch64

Make sure docker is running.

```bash
# The --load flag ensures the built image is available locally
docker buildx build --platform linux/amd64 -t eliza-starter:v1 --load .
```

#### Edit the docker-compose-image.yaml file with your environment variables

```yaml
services:
  eliza:
    environment:
      - OPENROUTER_API_KEY=blahdeeblahblahblah
```

#### Run the image

```bash
docker compose -f docker-compose-image.yaml up
```
