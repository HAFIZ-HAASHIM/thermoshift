"""
ThermoShift - PDF Fixture Generator for ThermoShift_Test_Project_Schedule.pdf
Generates a realistic 4-section construction project schedule document with:
1. Activity Schedule (10 distinct activities with varied durations, workers, skills, dependencies, deadlines)
2. Workforce Requirements (Skill definitions & capacities - NOT tasks)
3. Resource Availability (Cooling & equipment resources - NOT tasks)
4. Scheduling Notes (Operational guidelines - NOT tasks)
"""

def create_10_task_schedule_pdf_bytes() -> bytes:
    lines = [
        "THERMOSHIFT TEST PROJECT MASTER SCHEDULE",
        "Site: Phoenix Sector 4 | Project: Civil Infrastructure Expansion | Date: 2026-09-15",
        "================================================================================",
        "SECTION 1:",
        "Activity Schedule",
        "--------------------------------------------------------------------------------",
        "ID     | Activity                                  | Zone            | Duration | Min Workers | Required Skills  | Predecessor | Deadline",
        "A-101  | Site clearing and debris segregation      | North Yard      | 120 min  | 3           | Site Operations  | -           | 15 Sep 12:00",
        "A-102  | Stormwater trench excavation              | East Perimeter  | 180 min  | 4           | Excavation       | A-101       | 16 Sep 15:00",
        "A-103  | HDPE drainage pipe installation           | East Perimeter  | 150 min  | 3           | Pipe Installation| A-102       | 17 Sep 15:00",
        "A-104  | Compacted aggregate base preparation      | Loading Bay     | 210 min  | 4           | Earthworks       | A-101       | 18 Sep 16:00",
        "A-105  | Rebar cage assembly                       | Foundation Pad  | 180 min  | 3           | Rebar Work       | A-104       | 21 Sep 14:00",
        "A-106  | Foundation concrete placement             | Foundation Pad  | 240 min  | 5           | Concrete Work    | A-105       | 22 Sep 16:00",
        "A-107  | Curing blanket installation               | Foundation Pad  | 90 min   | 2           | Concrete Work    | A-106       | 23 Sep 12:00",
        "A-108  | Perimeter lighting conduit installation   | South Access    | 180 min  | 2           | Electrical       | A-104       | 24 Sep 15:00",
        "A-109  | Safety barrier and access gate setup      | South Access    | 120 min  | 3           | Site Operations  | A-108       | 25 Sep 12:00",
        "A-110  | Final drainage inspection                 | East Perimeter  | 90 min   | 2           | Inspection       | A-103       | 25 Sep 15:00",
        "",
        "SECTION 2:",
        "Workforce Requirements",
        "--------------------------------------------------------------------------------",
        "- Site Operations: 6 workers available (Trained for site logistics and barrier setup)",
        "- Excavation: 5 workers available (Trained for mechanical/manual excavation activities)",
        "- Pipe Installation: 4 workers available (Drainage and utility trench specialists)",
        "- Earthworks: 5 workers available (Heavy machinery and compaction operators)",
        "- Rebar Work: 4 workers available (Steel fixing and cage fabrication)",
        "- Concrete Work: 6 workers available (Pouring, leveling and curing specialists)",
        "- Electrical: 3 workers available (Conduit and wiring licensed technicians)",
        "- Inspection: 2 workers available (Quality and safety inspection officers)",
        "",
        "SECTION 3:",
        "Resource Availability",
        "--------------------------------------------------------------------------------",
        "- Shaded recovery station: capacity 2",
        "- Potable water station: capacity 4",
        "- Portable cooling unit: capacity 3",
        "- Plate compactor: capacity 1",
        "- Concrete pump: capacity 1",
        "",
        "SECTION 4:",
        "Scheduling Notes",
        "--------------------------------------------------------------------------------",
        "- All exterior activities subject to occupational heat-safety guidance.",
        "- Mandatory recovery breaks to be inserted by ThermoShift CP-SAT solver.",
        "- Peak solar hours (11:00 - 14:00) require strict WBGT monitoring."
    ]

    # Construct clean PDF stream
    bt_commands = ["BT", "/F1 9 Tf", "30 750 Td"]
    first = True
    for line in lines:
        sanitized = line.replace("(", "\\(").replace(")", "\\)")
        if first:
            bt_commands.append(f"({sanitized}) Tj")
            first = False
        else:
            spacing = -14
            bt_commands.append(f"0 {spacing} Td")
            bt_commands.append(f"({sanitized}) Tj")
    bt_commands.append("ET")
    
    stream_content = "\n".join(bt_commands)
    stream_len = len(stream_content.encode("latin-1"))

    pdf_structure = f"""%PDF-1.4
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
<< /Length {stream_len} >>
stream
{stream_content}
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
0000002400 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
2500
%%EOF"""
    return pdf_structure.encode("latin-1")

if __name__ == "__main__":
    pdf_bytes = create_10_task_schedule_pdf_bytes()
    with open("ThermoShift_Test_Project_Schedule.pdf", "wb") as f:
        f.write(pdf_bytes)
    with open("optimizer/tests/ThermoShift_Test_Project_Schedule.pdf", "wb") as f:
        f.write(pdf_bytes)
    print("Created 4-section ThermoShift_Test_Project_Schedule.pdf (root and optimizer/tests/)")
