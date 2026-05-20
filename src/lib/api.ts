export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Schedule = {
  id: number;
  class_name: string;
  lecturer: string;
  room: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

export type AttendanceUser = {
  id?: number;
  nrp?: string;
  nama?: string;
  name?: string;
  jurusan?: string;
  role?: string;
  image_path?: string;
  details?: string[];
};

export type AttendanceLogSchedule = {
  id: number;
  class_name: string;
  lecturer?: string;
  room?: string;
  day_of_week?: string;
  start_time?: string;
  end_time?: string;
  is_active?: boolean;
};

export type AttendanceRecord = {
  id?: number;
  user_id?: number;
  nrp?: string;
  employee_id?: string;
  class_name?: string;
  confidence?: number;
  name?: string;
  nama?: string;
  schedule_id?: number;
  schedule?: AttendanceLogSchedule;
  timestamp?: string;
  status?: string;
  user?: AttendanceUser | string;
  details?: string[];
  message?: string;
};

export type RecognizedUser = {
  name: string;
  nrp?: string;
  jurusan?: string;
  message?: string;
  details?: string[];
  attendanceStatus?: string;
  resultStatus?: string;
  confidence?: number;
  liveness?: number;
  cooldownRemaining?: number;
  quality?: string[];
  livenessReasons?: string[];
};

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AttendanceFaceResult = {
  status?: string;
  nrp?: string;
  name?: string;
  user?: AttendanceUser;
  box?: FaceBox;
  confidence?: number;
  liveness?: number;
  attendance_status?: string;
  message?: string;
  cooldown_remaining?: number;
  quality?: string[];
  liveness_reasons?: string[];
};

export type AttendanceResponse = {
  status?: "success" | "partial" | "duplicate" | "fail" | string;
  message?: string;
  processed_at?: string;
  liveness_reasons?: string[];
  schedule_id?: number;
  schedule?: Schedule;
  recognized?: AttendanceFaceResult[];
  detail?: string;
  embedding?: number[];
  user?: AttendanceUser | string;
  data?: AttendanceUser | AttendanceRecord;
  student?: AttendanceUser;
  nrp?: string;
  id?: string | number;
  student_id?: string;
  nama?: string;
  name?: string;
  student_name?: string;
  jurusan?: string;
  major?: string;
  department?: string;
  details?: string[];
};

export async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  const data = (await res.json()) as T;

  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data &&
      "detail" in data &&
      typeof data.detail === "string"
        ? data.detail
        : `Request failed with ${res.status}`;
    throw new Error(message);
  }

  return data;
}

function isIdentifierLikeName(value?: string, nrp?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return trimmed === nrp || /^\d{6,}$/.test(trimmed);
}

function getAttendanceRecordUserName(attendance: AttendanceRecord) {
  if (typeof attendance.user === "string") {
    return isIdentifierLikeName(attendance.user, attendance.nrp)
      ? undefined
      : attendance.user;
  }

  return attendance.user?.nama || attendance.user?.name;
}

export async function resolveRegisteredUserName(
  user: RecognizedUser
): Promise<RecognizedUser> {
  if (!user.nrp || !isIdentifierLikeName(user.name, user.nrp)) {
    return user;
  }

  try {
    const params = new URLSearchParams();
    params.set("nrp", user.nrp);
    const records = await fetchJson<AttendanceRecord[]>(
      `/admin/attendances?${params.toString()}`
    );
    const match = records.find((record) => getAttendanceRecordUserName(record));
    const name = match ? getAttendanceRecordUserName(match) : undefined;

    if (!name) {
      return user;
    }

    return {
      ...user,
      name,
      jurusan:
        user.jurusan ||
        (typeof match?.user === "object" ? match.user.jurusan : undefined),
    };
  } catch (error) {
    console.debug("Unable to resolve registered user name:", error);
    return user;
  }
}

function parseRecognizedFace(
  recognized: AttendanceFaceResult,
  data: AttendanceResponse
): RecognizedUser {
    const nrp = recognized.user?.nrp || recognized.nrp;
    const rawName = recognized.user?.nama || recognized.name;

    return {
      name:
        (isIdentifierLikeName(rawName, nrp) ? undefined : rawName) ||
        nrp ||
        data.message ||
        "Unknown",
      nrp,
      jurusan: recognized.user?.jurusan,
      message: recognized.message || data.message,
      attendanceStatus: recognized.attendance_status || recognized.status,
      resultStatus: recognized.status || data.status,
      confidence: recognized.confidence,
      liveness: recognized.liveness,
      cooldownRemaining: recognized.cooldown_remaining,
      quality: recognized.quality,
      livenessReasons: recognized.liveness_reasons || data.liveness_reasons,
    };
}

export function parseRecognizedUsers(data: AttendanceResponse): RecognizedUser[] {
  if (data.recognized?.length) {
    return data.recognized.map((recognized) =>
      parseRecognizedFace(recognized, data)
    );
  }

  return [parseRecognizedUser(data)];
}

export function parseRecognizedUser(data: AttendanceResponse): RecognizedUser {
  const userName = typeof data.user === "string" ? data.user : undefined;
  const candidate = (typeof data.user === "object"
    ? data.user
    : data.student ||
      data.data ||
      data) as Partial<AttendanceUser & AttendanceRecord & AttendanceResponse>;
  const details = data.details || candidate.details;
  const detailText = details?.[0];
  const detailName = detailText?.match(/:\s*(.*)$/)?.[1] || detailText;
  const rawName =
    userName ||
    candidate.nama ||
    candidate.name ||
    data.nama ||
    data.name ||
    data.student_name ||
    detailName ||
    data.message ||
    "Unknown";

  return {
    name: rawName,
    nrp:
      candidate.nrp ||
      data.nrp ||
      String(data.id || data.student_id || "").trim() ||
      undefined,
    jurusan:
      candidate.jurusan || data.jurusan || data.major || data.department,
    message: data.message,
    resultStatus: data.status,
    livenessReasons: data.liveness_reasons,
    details,
  };
}

export function getRecognitionDisplay(user?: RecognizedUser | null) {
  const status = user?.resultStatus || user?.attendanceStatus;

  if (status === "checked_in") {
    return {
      cardTitle: "Attendance Marked",
      color: "#16a34a",
      label: user?.name || "Attendance marked",
      statusKind: "success" as const,
      message: "Attendance marked",
    };
  }

  if (status === "spoof_suspected") {
    return {
      cardTitle: "Spoof Suspected",
      color: "#dc2626",
      label: "Spoof suspected",
      statusKind: "error" as const,
      message: "Phone screen or spoof attempt suspected",
    };
  }

  if (status === "not_registered") {
    return {
      cardTitle: "Not Registered",
      color: "#f59e0b",
      label: "Not registered",
      statusKind: "error" as const,
      message: "Not registered",
    };
  }

  if (status === "poor_quality") {
    return {
      cardTitle: "Poor Quality",
      color: "#f97316",
      label: "Poor quality",
      statusKind: "error" as const,
      message: "Face quality is not good enough for attendance",
    };
  }

  if (status === "duplicate" || user?.cooldownRemaining) {
    return {
      cardTitle: "Already Recorded",
      color: "#2563eb",
      label: user?.name || "Already recorded",
      statusKind: "info" as const,
      message: "Already checked in",
    };
  }

  if (status === "fail") {
    return {
      cardTitle: "Scan Failed",
      color: "#dc2626",
      label: "Scan failed",
      statusKind: "error" as const,
      message: user?.message || "Attendance could not be processed",
    };
  }

  if (status === "partial") {
    return {
      cardTitle: "Partially Processed",
      color: "#2563eb",
      label: user?.name || "Partially processed",
      statusKind: "info" as const,
      message: user?.message || "Some faces need attention",
    };
  }

  return {
    cardTitle: "Attendance Marked",
    color: "#16a34a",
    label: user?.name || "Recognized",
    statusKind: "success" as const,
    message: "Attendance marked",
  };
}

export function getAttendanceResponseKind(data: AttendanceResponse) {
  if (
    data.status === "fail" ||
    data.recognized?.some((face) =>
      ["not_registered", "spoof_suspected", "poor_quality"].includes(
        face.status || ""
      )
    )
  ) {
    return "error" as const;
  }

  if (
    data.status === "partial" ||
    data.status === "duplicate" ||
    data.recognized?.some((face) => face.status === "duplicate")
  ) {
    return "info" as const;
  }

  return "success" as const;
}
