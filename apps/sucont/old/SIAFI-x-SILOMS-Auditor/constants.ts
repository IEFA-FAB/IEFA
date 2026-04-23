import { RawInputRow } from './types';

// Helper to generate a consistent mock value based on index and month to allow for "trends"
const getTrendValue = (base: number, monthIndex: number, volatility: number) => {
  // Simulate a random walk or trend
  const randomFactor = 1 + ((Math.random() - 0.5) * volatility); 
  return base * randomFactor;
};

// Generator to reach ~82 UGs with 7 months of history (Jan - Jul)
const generateFullHistoryData = (): RawInputRow[] => {
  const rows: RawInputRow[] = [];
  const baseCode = 120000;
  
  // Real UGs from image + Extras
  const ugNames = [
    "PAMA-SP", "PAMA-GL", "CISCEA", "BACG", "BAGL", "BABR", "GAP-RJ", "HCA", "BACO", "GAP-AF",
    "GAP-SJ", "GAP-LS", "GAP-BE", "GAP-RF", "GAP-MN", "GAP-CO", "GAP-SV",
    "CINDACTA I", "CINDACTA II", "CINDACTA III", "CINDACTA IV",
    "BASC", "BASM", "BANT", "BAPV", "BABE", "BAAN", "BAFL", "BAFZ", "BAMN", "BASP",
    "CELOG", "DIRMAB", "DIRINFRA", "DIRENS", "DIRSA", "SEFA", "SUCONT"
  ];

  // Fill up to 82 with generic names if needed
  for (let i = ugNames.length; i < 82; i++) {
    ugNames.push(`UG-GENERICA-${i+1}`);
  }

  const months = [
    "JANEIRO/2025", "FEVEREIRO/2025", "MARÇO/2025", "ABRIL/2025", "MAIO/2025", "JUNHO/2025", "JULHO/2025"
  ];

  ugNames.forEach((ug, index) => {
    // Assign a "base" magnitude for this UG so numbers look consistent but different
    // Some are huge (Billions), some are small (Millions)
    const magnitude = Math.random() > 0.8 ? 1000000000 : Math.random() > 0.5 ? 100000000 : 10000000;
    
    let currentSiafiConsumo = magnitude * (0.8 + Math.random());
    let currentSilomsConsumo = currentSiafiConsumo * 0.95; // Initial diff

    let currentSiafiBMP = (magnitude * 0.5) * (0.8 + Math.random());
    let currentSilomsBMP = currentSiafiBMP * 0.90;

    months.forEach((month, mIndex) => {
      // Evolve values slightly each month
      currentSiafiConsumo = getTrendValue(currentSiafiConsumo, mIndex, 0.05);
      // Randomly decide if diff widens or narrows
      if (Math.random() > 0.6) {
         // Divergence worsens
         currentSilomsConsumo = currentSilomsConsumo * 0.98; 
      } else {
         // Divergence improves (catches up)
         currentSilomsConsumo = currentSiafiConsumo * 0.99;
      }

      currentSiafiBMP = getTrendValue(currentSiafiBMP, mIndex, 0.03);
      if (Math.random() > 0.7) {
        currentSilomsBMP = currentSilomsBMP * 0.97;
      } else {
        currentSilomsBMP = currentSiafiBMP * 0.995;
      }

      const g3Siafi = Math.random() * 100000;
      const g3Siloms = Math.random() * 100000;

      rows.push({
        data: month,
        cod: (baseCode + index).toString(),
        ug: ug,
        g1_name: "CONSUMO",
        g1_siafi: currentSiafiConsumo,
        g1_siloms: currentSilomsConsumo,
        g1_diff: Math.abs(currentSiafiConsumo - currentSilomsConsumo),
        g2_name: "BMP",
        g2_siafi: currentSiafiBMP,
        g2_siloms: currentSilomsBMP,
        g2_diff: Math.abs(currentSiafiBMP - currentSilomsBMP),
        g3_name: "INTANGIVEL",
        g3_siafi: g3Siafi,
        g3_siloms: g3Siloms, // Small diffs for Intangivel
        g3_diff: Math.abs(g3Siafi - g3Siloms)
      });
    });
  });

  return rows;
};

export const MOCK_RAW_DATA: RawInputRow[] = generateFullHistoryData();