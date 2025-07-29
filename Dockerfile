FROM ubuntu:22.04

# Set environment variables to prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Update and install essential packages (excluding nodejs/npm for now)
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    sudo \
    python3 \
    python3-pip \
    vim \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x (LTS) from NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install global npm packages for TypeScript development
RUN npm install -g \
    typescript \
    ts-node \
    @types/node \
    npm@latest

# Create developer user with sudo privileges
RUN useradd -m -s /bin/bash developer && \
    echo "developer:developer" | chpasswd && \
    usermod -aG sudo developer && \
    echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Switch to developer user
USER developer
WORKDIR /home/developer

# Create project directory
RUN mkdir -p /home/developer/s5.js

# Set up npm global directory for the developer user
RUN mkdir -p /home/developer/.npm-global && \
    npm config set prefix '/home/developer/.npm-global' && \
    echo 'export PATH=/home/developer/.npm-global/bin:$PATH' >> /home/developer/.bashrc

# Expose ports
# 5522 for Enhanced s5.js
# 5523 for external access
EXPOSE 5522 5523

# Set the working directory
WORKDIR /home/developer/s5.js

# Keep container running
CMD ["/bin/bash"]