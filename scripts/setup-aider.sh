#!/bin/sh
mkdir -p "$HOME/.local/bin"
rm -f "$HOME/.local/bin/aider"
cat > "$HOME/.local/bin/aider" << 'WRAPPER'
#!/bin/sh
export LD_LIBRARY_PATH="/nix/store/1w5p5kp8qp1qg5jha6jv0m8kslwwagcj-gcc-14.2.1.20250322-lib/lib:$LD_LIBRARY_PATH"
exec /home/runner/workspace/.local/share/uv/tools/aider-chat/bin/aider --analytics-disable "$@"
WRAPPER
chmod +x "$HOME/.local/bin/aider"
