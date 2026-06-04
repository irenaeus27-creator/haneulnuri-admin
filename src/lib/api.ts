const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function getSheetData(sheetName: string) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되지 않았습니다.");
  }

  const response = await fetch(
    `${API_URL}?action=getSheet&sheet=${sheetName}`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`${sheetName} 데이터를 불러오지 못했습니다.`);
  }

  return response.json();
}

export async function getDashboardData() {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되지 않았습니다.");
  }

  const response = await fetch(
    `${API_URL}?action=getDashboard`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error("대시보드 데이터를 불러오지 못했습니다.");
  }

  return response.json();
}