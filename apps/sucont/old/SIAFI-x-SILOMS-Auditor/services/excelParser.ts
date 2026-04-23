
import { RawInputRow } from '../types';
import { read, utils } from 'xlsx';

export const parseExcelFile = async (file: File): Promise<RawInputRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("File content is empty");

        const workbook = read(data, { type: 'array', cellDates: true });
        
        // Assume data is in the first sheet
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) throw new Error("No sheets found in workbook");
        
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays (header: 1)
        const jsonData = utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: null });

        const parsedRows: RawInputRow[] = [];
        let offset = 0;
        let startRowIndex = -1;

        // --- PRE-SCAN FOR INITIAL DATE ---
        let initialDate = '';
        for (let i = 0; i < Math.min(jsonData.length, 100); i++) {
            const row = jsonData[i];
            if (!row || !Array.isArray(row)) continue;
            for (const cell of row) {
                if (!cell) continue;
                const str = String(cell).trim().toUpperCase();
                if ((str.includes('/') && /\d/.test(str)) || 
                    (str.includes('-') && /\d/.test(str)) ||
                    (str.includes(' ') && /\d/.test(str)) ||
                    (str.includes('202') && (str.includes('JAN') || str.includes('FEV') || str.includes('MAR') || str.includes('ABR') || str.includes('SET')))) {
                    initialDate = String(cell);
                    break;
                }
            }
            if (initialDate) break;
        }

        // --- SHIFT DETECTION STRATEGY ---
        // Iterate first 30 rows to find the Header row
        for (let i = 0; i < Math.min(jsonData.length, 30); i++) {
            const row = jsonData[i];
            if (!row || row.length < 2) continue;

            const col0 = String(row[0] || '').toUpperCase().trim();
            const col1 = String(row[1] || '').toUpperCase().trim();

            // Case A: Standard Header [DATA, COD, UG, ...]
            if (col0 === 'DATA' || col0.includes('MÊS') || col0.includes('REF') || col0.includes('PERÍODO')) {
                startRowIndex = i + 1;
                offset = 0;
                break;
            }
            
            // Case B: Shifted Header (Col A missing) [COD, UG, GRP...]
            if (col0 === 'COD' || col0 === 'CÓD' || col0 === 'UG') {
                startRowIndex = i + 1;
                offset = -1;
                break;
            }

            // Case C: Data looks like data (Date in Col 0)
            if ((col0.includes('/') && /\d/.test(col0)) || (col0.length === 6 && !isNaN(Number(col0)))) {
                 startRowIndex = i;
                 offset = 0;
                 break;
            }
        }

        if (startRowIndex === -1) {
            console.warn("Could not detect header or data pattern. Defaulting to row 1, offset 0.");
            startRowIndex = 1;
        }

        // --- DEFENSIVE READING LOOP ---
        let lastKnownDate = initialDate;

        for (let i = startRowIndex; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || !Array.isArray(row)) continue;

          const getCol = (baseIndex: number) => {
             const idx = baseIndex + offset;
             return idx >= 0 ? row[idx] : undefined;
          };

          const safeNum = (val: any): number => {
            if (typeof val === 'number') return isNaN(val) ? 0 : val;
            if (!val) return 0;
            if (typeof val === 'string') {
                const clean = val.replace(/[^\d,-]/g, '').replace(',', '.');
                const num = parseFloat(clean);
                return isNaN(num) ? 0 : num;
            }
            return 0;
          };
          
          const safeStr = (val: any) => {
              if (val instanceof Date) return val.toISOString();
              return (val !== undefined && val !== null) ? String(val).trim() : '';
          };

          // Date Logic: Update lastKnownDate if we find a new one in Col A or the offset column
          const dateCandidate = safeStr(row[0]) || (offset > 0 ? safeStr(row[offset]) : '');
          if (dateCandidate && dateCandidate.length >= 3) {
              // Check if it looks like a date (contains slash, dash, space, or is a long string)
              if (dateCandidate.includes('/') || dateCandidate.includes('-') || dateCandidate.includes(' ') || dateCandidate.length > 5) {
                  lastKnownDate = dateCandidate;
              }
          }

          const codVal = safeStr(getCol(1)); // Col B
          const ugVal = safeStr(getCol(2));  // Col C

          // Without a Code or UG name, the row is useless
          if (!codVal && !ugVal) continue;

          // STRICT MAPPING MENTIONED IN PROMPT
          // CONSUMO -> E, F, G (Indices 4, 5, 6)
          // BMP     -> I, J, K (Indices 8, 9, 10)
          // INTANG  -> M, N, O (Indices 12, 13, 14)

          parsedRows.push({
            data: lastKnownDate || 'DATA_DESCONHECIDA',
            cod: codVal || '000000',
            ug: ugVal || 'UG_DESCONHECIDA',
            
            // Consumo
            g1_name: 'CONSUMO',
            g1_siafi: safeNum(getCol(4)),
            g1_siloms: safeNum(getCol(5)),
            g1_diff: safeNum(getCol(6)),
            
            // BMP
            g2_name: 'BMP',
            g2_siafi: safeNum(getCol(8)),
            g2_siloms: safeNum(getCol(9)),
            g2_diff: safeNum(getCol(10)),
            
            // Intangível
            g3_name: 'INTANGIVEL',
            g3_siafi: safeNum(getCol(12)),
            g3_siloms: safeNum(getCol(13)),
            g3_diff: safeNum(getCol(14)),
          });
        }

        resolve(parsedRows);
      } catch (error) {
        console.error("Parse Error:", error);
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};
