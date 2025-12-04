import mqtt, { MqttClient } from "mqtt";

// Sử dụng public MQTT broker (có thể thay đổi sau)
// Options: test.mosquitto.org, broker.hivemq.com, hoặc tự host
const MQTT_BROKER_URL = process.env.NEXT_PUBLIC_MQTT_BROKER_URL || "wss://test.mosquitto.org:8081";

export type MQTTStatus = "connecting" | "connected" | "closed" | "error";

export interface MQTTMessage {
  type: string;
  [key: string]: unknown;
}

export class MQTTClient {
  private client: MqttClient | null = null;
  private roomId: string = "";
  private status: MQTTStatus = "closed";
  private onStatusChange?: (status: MQTTStatus) => void;
  private onMessage?: (message: MQTTMessage) => void;
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  connect(roomId: string, playerName: string): void {
    if (this.client?.connected && this.roomId === roomId) {
      return; // Đã kết nối rồi
    }

    this.disconnect();
    this.roomId = roomId;

    const options = {
      clientId: this.clientId,
      clean: true,
      reconnectPeriod: 1000,
      connectTimeout: 10000,
      will: {
        topic: `game/${roomId}/disconnect`,
        payload: JSON.stringify({ player: playerName, clientId: this.clientId }),
        qos: 1,
        retain: false,
      } as const,
    };

    try {
      this.setStatus("connecting");
      this.client = mqtt.connect(MQTT_BROKER_URL, options);

      this.client.on("connect", () => {
        this.setStatus("connected");
        // Subscribe to room topic
        const topic = `game/${roomId}/+`;
        this.client?.subscribe(topic, { qos: 1 }, (err) => {
          if (err) {
            console.error("MQTT subscribe error:", err);
            this.setStatus("error");
          }
        });
      });

      this.client.on("message", (topic, message) => {
        try {
          const data = JSON.parse(message.toString()) as MQTTMessage & { clientId?: string };
          // Skip messages from self
          if (data.clientId && data.clientId === this.clientId) return;
          this.onMessage?.(data);
        } catch (err) {
          console.error("MQTT message parse error:", err);
        }
      });

      this.client.on("error", (err) => {
        console.error("MQTT error:", err);
        this.setStatus("error");
      });

      this.client.on("close", () => {
        this.setStatus("closed");
      });

      this.client.on("offline", () => {
        this.setStatus("closed");
      });

      this.client.on("reconnect", () => {
        this.setStatus("connecting");
      });
    } catch (err) {
      console.error("MQTT connect error:", err);
      this.setStatus("error");
    }
  }

  publish(type: string, payload: Record<string, unknown>): void {
    if (!this.client?.connected || !this.roomId) return;

    const topic = `game/${this.roomId}/${type}`;
    const message = JSON.stringify({
      ...payload,
      clientId: this.clientId,
      timestamp: Date.now(),
    });

    this.client.publish(topic, message, { qos: 1 }, (err) => {
      if (err) {
        console.error("MQTT publish error:", err);
      }
    });
  }

  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
    this.roomId = "";
    this.setStatus("closed");
  }

  getStatus(): MQTTStatus {
    return this.status;
  }

  setOnStatusChange(callback: (status: MQTTStatus) => void): void {
    this.onStatusChange = callback;
  }

  setOnMessage(callback: (message: MQTTMessage) => void): void {
    this.onMessage = callback;
  }

  private setStatus(status: MQTTStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.onStatusChange?.(status);
    }
  }
}

