"""
ThermoShift - PDF Fixture Generator for Schedule Import Testing
Generates a valid standard PDF document containing 8 construction activities.
"""

import io
from pypdf import PdfWriter

def create_sample_pdf_bytes() -> bytes:
    # Build minimal valid text PDF using raw PDF stream or pypdf
    # In standard PDF, text objects are in content streams: BT /F1 12 Tf ... ET
    content = """%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 1200 >>
stream
BT
/F1 12 Tf
50 720 Td
(APEX COMMERCIAL TOWER - PHASE 2 MASTER SCHEDULE) Tj
0 -24 Td
(Site: Phoenix, AZ Sector 4B | Shift: 07:00 - 17:00) Tj
0 -30 Td
(1. Formwork & Framing - Duration: 120 mins - 3 workers - Carpentry - Zone: Sector 1) Tj
0 -20 Td
(2. Rebar Placement & Tying - Duration: 90 mins - 3 workers - Masonry - Zone: Sector 1 - Predecessor: Formwork) Tj
0 -20 Td
(3. Concrete Pouring Slab - Duration: 180 mins - 4 workers - Masonry - Zone: Sector 1 - Predecessor: Rebar) Tj
0 -20 Td
(4. Waterproofing Membrane - Duration: 120 mins - 3 workers - Roofing - Zone: Sector 2 - Predecessor: Concrete Pouring) Tj
0 -20 Td
(5. Electrical Conduit Installation - Duration: 180 mins - 2 workers - Electrical - Zone: Tower B) Tj
0 -20 Td
(6. Cable Pulling & Termination - Duration: 150 mins - 2 workers - Electrical - Zone: Tower B - Predecessor: Conduit) Tj
0 -20 Td
(7. Structural Steel Welding - Duration: 210 mins - 3 workers - Welding - Zone: Grid 4B) Tj
0 -20 Td
(8. Site Safety & Quality Inspection - Duration: 60 mins - 1 worker - Safety Inspection - Zone: Grid 4B - Predecessor: Steel Welding) Tj
0 -30 Td
(Target Deadline: 17:00:00 | Supervisor Sign-off Required) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000001497 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
1566
%%EOF"""
    return content.encode("latin-1")

if __name__ == "__main__":
    with open("optimizer/tests/Apex_Tower_Phase_2_Schedule.pdf", "wb") as f:
        f.write(create_sample_pdf_bytes())
    print("Created optimizer/tests/Apex_Tower_Phase_2_Schedule.pdf")
