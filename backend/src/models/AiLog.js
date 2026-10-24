import mongoose from 'mongoose';

const aiLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    feature: { type: String, enum: ['chat', 'summary', 'smart_leave'], required: true },
    input: { type: String },
    output: { type: String },
    tools: [{ name: String, args: mongoose.Schema.Types.Mixed }],
    ok: { type: Boolean, default: true },
    error: { type: String },
    latencyMs: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

aiLogSchema.index({ user: 1, createdAt: -1 });

export const AiLog = mongoose.model('AiLog', aiLogSchema);
