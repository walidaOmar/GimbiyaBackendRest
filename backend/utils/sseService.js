// userId → Express Response connection map
const connections = new Map();

/**
 * handleSSEConnection
 * Called on GET /api/events/subscribe (after verifyToken middleware).
 */
export function handleSSEConnection(req, res) {
  const userId = req.userId;

  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  connections.set(userId, res);
  console.log(`[SSE] Connected: ${userId}. Total: ${connections.size}`);

  // Heartbeat every 25s — keeps alive through proxies and load balancers
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25000);

  // Confirm connection to client
  writeSSE(res, "connected", { message: "SSE connection established." });

  req.on("close", () => {
    clearInterval(heartbeat);
    connections.delete(userId);
    console.log(`[SSE] Disconnected: ${userId}. Total: ${connections.size}`);
  });
}

/**
 * notifyUser — push event to one user if connected
 */
export function notifyUser(userId, eventName, data) {
  const res = connections.get(String(userId));
  if (!res) return;
  writeSSE(res, eventName, data);
}

/**
 * notifyMany — broadcast to multiple userIds
 */
export function notifyMany(userIds, eventName, data) {
  userIds.forEach((id) => notifyUser(id, eventName, data));
}

export function getConnectionCount() {
  return connections.size;
}

function writeSSE(res, eventName, data) {
  try {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Client disconnected mid-write — silently ignore
  }
}
