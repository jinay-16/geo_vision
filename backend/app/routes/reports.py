"""Reports endpoints — JSON summary and PDF download."""

import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
from ..schemas.responses import ReportSummaryResponse
from ..services.demo_data import demo_data, DEMO_SOURCE, ANALYSIS_DATE
from ..config import settings

router = APIRouter()

DISCLAIMER = (
    "This report contains experimental risk estimates generated from satellite-derived "
    "environmental indicators. Results are NOT official government assessments and require "
    "field verification. Risk scores are model/demo risk categories, not validated predictions. "
    "Do not use this report as a substitute for official environmental impact assessments."
)


@router.get("/reports/summary", response_model=ReportSummaryResponse)
async def get_report_summary():
    overview = demo_data.get_overview()
    defor = demo_data.get_module_data("deforestation")
    mining = demo_data.get_module_data("mining")
    flood = demo_data.get_module_data("flood")

    return ReportSummaryResponse(
        title="GeoVision AI — Environmental Risk Assessment Report",
        generated_at=datetime.now().isoformat(),
        pilot_area=settings.PILOT_AREA,
        analysis_period=settings.ANALYSIS_PERIOD,
        overview={
            "total_regions": overview["total_monitored_regions"],
            "total_points": overview["total_points"],
            "high_risk_zones": overview["high_risk_zones"],
        },
        deforestation={
            "total_points": defor["summary"]["total_points"],
            "high_risk": defor["risk_distribution"]["high"],
            "avg_ndvi_change": defor["summary"]["avg_change"],
        },
        mining={
            "total_points": mining["summary"]["total_points"],
            "high_risk": mining["risk_distribution"]["high"],
            "avg_ndbi_change": mining["summary"]["avg_change"],
        },
        flood={
            "total_points": flood["summary"]["total_points"],
            "high_risk": flood["risk_distribution"]["high"],
            "avg_ndwi_change": flood["summary"]["avg_change"],
        },
        source=demo_data.get_source(),
        is_demo=demo_data.is_demo,
        disclaimer=DISCLAIMER,
    )


@router.get("/reports/pdf")
async def download_pdf_report(
    module: Optional[str] = Query(None, description="Filter by module: deforestation, mining, flood"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level: High, Medium, Low"),
):
    """Generate and return a PDF report."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.lib.colors import HexColor
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from fastapi import HTTPException

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=1.5 * cm,
            rightMargin=1.5 * cm,
            topMargin=1.5 * cm,
            bottomMargin=1.5 * cm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "CustomTitle",
            parent=styles["Title"],
            fontSize=20,
            spaceAfter=6,
            textColor=HexColor("#0f172a"),
            alignment=0,
        )
        subtitle_style = ParagraphStyle(
            "CustomSubtitle",
            parent=styles["Normal"],
            fontSize=11,
            spaceAfter=15,
            textColor=HexColor("#2563eb"),
        )
        heading_style = ParagraphStyle(
            "CustomHeading",
            parent=styles["Heading2"],
            fontSize=13,
            spaceAfter=8,
            spaceBefore=14,
            textColor=HexColor("#1e293b"),
        )
        meta_style = ParagraphStyle(
            "MetaText",
            parent=styles["Normal"],
            fontSize=9,
            textColor=HexColor("#475569"),
            spaceAfter=3,
        )
        cell_style = ParagraphStyle(
            "TableCell",
            parent=styles["Normal"],
            fontSize=8,
            textColor=HexColor("#1e293b"),
        )
        disclaimer_style = ParagraphStyle(
            "Disclaimer",
            parent=styles["Normal"],
            fontSize=8,
            textColor=HexColor("#64748b"),
            spaceBefore=15,
        )

        elements = []

        # 1. Header & Metadata
        elements.append(Paragraph("GeoVision AI", title_style))
        elements.append(
            Paragraph("Environmental Risk Assessment & Multi-Temporal Audit Report", subtitle_style)
        )
        elements.append(
            Paragraph(f"<b>Generated:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}", meta_style)
        )
        elements.append(Paragraph(f"<b>Study Area:</b> {settings.PILOT_AREA}", meta_style))
        elements.append(Paragraph(f"<b>Analysis Period:</b> {settings.ANALYSIS_PERIOD}", meta_style))
        elements.append(Paragraph(f"<b>Data Source:</b> {demo_data.get_source()}", meta_style))

        filter_desc = []
        if module and module.lower() != "all":
            filter_desc.append(f"Module: <b>{module.capitalize()}</b>")
        if risk_level and risk_level.lower() != "all":
            filter_desc.append(f"Risk Filter: <b>{risk_level.capitalize()} Only</b>")
        if filter_desc:
            elements.append(
                Paragraph(f"<b>Audit Scope:</b> {' | '.join(filter_desc)}", meta_style)
            )

        elements.append(Spacer(1, 12))

        # 2. Executive Overview
        overview = demo_data.get_overview()
        elements.append(Paragraph("1. Executive Overview", heading_style))
        overview_data = [
            ["Metric", "Value"],
            ["Total Monitored Regions", str(overview.get("total_monitored_regions", "N/A"))],
            ["Total Sample Points", str(overview.get("total_points", "N/A"))],
            ["High-Risk Zones (All Modules)", str(overview.get("high_risk_zones", "N/A"))],
            ["Vegetation Loss Alert Areas", str(overview.get("vegetation_loss_areas", "N/A"))],
            ["Potential Land Disturbance Areas", str(overview.get("land_disturbance_areas", "N/A"))],
            ["Flood Risk Alert Areas", str(overview.get("flood_risk_areas", "N/A"))],
        ]
        t_overview = Table(overview_data, colWidths=[11 * cm, 7 * cm])
        t_overview.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1e293b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#ffffff")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#e2e8f0")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#f8fafc"), HexColor("#ffffff")]),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
            ])
        )
        elements.append(t_overview)
        elements.append(Spacer(1, 10))

        # 3. Module Summaries
        modules_to_include = [
            ("deforestation", "2. Deforestation / Vegetation Loss Analysis"),
            ("mining", "3. Potential Mining & Land Disturbance"),
            ("flood", "4. Flood / Water-Extent Dynamic Risk"),
        ]
        if module and module.lower() != "all":
            modules_to_include = [m for m in modules_to_include if m[0] == module.lower()]

        for m_name, label in modules_to_include:
            data = demo_data.get_module_data(m_name)
            s = data.get("summary", {})
            avg_change = s.get("avg_change")
            avg_risk = s.get("avg_risk_score")
            elements.append(Paragraph(label, heading_style))
            mod_data = [
                ["Metric", "Value"],
                ["Total Monitored Points", str(s.get("total_points", 0))],
                ["High Risk Zones", str(s.get("high_risk_zones", 0))],
                ["Medium Risk Zones", str(s.get("medium_risk_zones", 0))],
                ["Low Risk Zones", str(s.get("low_risk_zones", 0))],
                ["Average Index Change", f"{avg_change:+.4f}" if isinstance(avg_change, (int, float)) else "N/A"],
                ["Average Risk Score", f"{avg_risk:.1f}/100" if isinstance(avg_risk, (int, float)) else "N/A"],
            ]
            t_mod = Table(mod_data, colWidths=[11 * cm, 7 * cm])
            t_mod.setStyle(
                TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#2563eb")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#ffffff")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#e2e8f0")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#f8fafc"), HexColor("#ffffff")]),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                ])
            )
            elements.append(t_mod)
            elements.append(Spacer(1, 8))

        # 4. Priority Hotspots Audit Table
        target_mod = module if (module and module.lower() != "all") else None
        hotspots = demo_data.get_hotspots(module=target_mod, limit=200)
        if risk_level and risk_level.lower() != "all":
            hotspots = [h for h in hotspots if h.get("risk_level", "").lower() == risk_level.lower()]

        elements.append(Paragraph("5. Priority Monitored Locations (Sample Findings)", heading_style))
        sample_hotspots = hotspots[:15]
        if sample_hotspots:
            table_rows = [["Region", "Module", "Lat/Lon", "Change", "Risk", "Verification"]]
            for h in sample_hotspots:
                lat = f"{h.get('latitude', 0):.3f}"
                lng = f"{h.get('longitude', 0):.3f}"
                chg = h.get("change_value")
                chg_str = f"{chg:+.3f}" if isinstance(chg, (int, float)) else "N/A"
                table_rows.append([
                    Paragraph(str(h.get("region", "")), cell_style),
                    str(h.get("module", "")).capitalize(),
                    f"{lat}, {lng}",
                    chg_str,
                    f"{h.get('risk_score', '')} ({h.get('risk_level', '')})",
                    "Required" if h.get("requires_field_verification") else "Optional",
                ])

            t_hotspots = Table(table_rows, colWidths=[4 * cm, 2.5 * cm, 3.5 * cm, 2.2 * cm, 3.2 * cm, 2.6 * cm])
            t_hotspots.setStyle(
                TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#334155")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#ffffff")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#cbd5e1")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#ffffff"), HexColor("#f8fafc")]),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                ])
            )
            elements.append(t_hotspots)
        else:
            elements.append(Paragraph("No records matching the selected filter criteria.", meta_style))

        # 5. Disclaimer & Verification Note
        elements.append(Spacer(1, 15))
        elements.append(Paragraph("Legal & Scientific Disclaimer", heading_style))
        elements.append(Paragraph(DISCLAIMER, disclaimer_style))

        doc.build(elements)
        buffer.seek(0)

        filename = f"geovision_report_{module or 'all'}_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except ImportError:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="reportlab is not installed. Run: pip install reportlab")
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


def _normalize_and_validate_aoi_payload(payload: dict) -> dict:
    if not payload or not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="Payload is required for custom AOI report generation. Regional reports must be accessed via /reports/summary.",
        )

    data = dict(payload)
    # Recursively unwrap supported nested analysis_results payloads
    while "analysis_results" in data and isinstance(data["analysis_results"], dict):
        ar = dict(data["analysis_results"])
        for k, v in data.items():
            if k != "analysis_results" and k not in ar:
                ar[k] = v
        data = ar

    if "aoi_name" in data and not data.get("region_name"):
        data["region_name"] = data["aoi_name"]

    summary = data.get("summary")
    ml_result = data.get("ml_result")
    valid_summary = isinstance(summary, dict) and len(summary) > 0
    valid_ml = isinstance(ml_result, dict) and len(ml_result) > 0

    if not valid_summary and not valid_ml:
        raise HTTPException(
            status_code=400,
            detail="Missing required AOI analysis findings ('summary' or 'ml_result'). Regional baseline data cannot be substituted for custom AOI reports.",
        )

    return data


@router.post("/reports/generate-aoi-report")
@router.post("/reports/aoi")
async def create_aoi_written_report(payload: dict = None):
    """
    Generate an in-depth, structured written environmental intelligence report
    synthesized directly from custom AOI satellite analysis data.
    """
    from ..services.report_generator import generate_written_aoi_report

    data = _normalize_and_validate_aoi_payload(payload)

    try:
        report = generate_written_aoi_report(data)
        return report
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Written report generation failed: {str(e)}")


@router.post("/reports/aoi-pdf")
@router.post("/reports/download-aoi-pdf")
async def download_aoi_pdf_report(payload: dict = None):
    """
    Generate and stream a full PDF audit report specifically for a custom AOI written analysis.
    """
    from ..services.report_generator import generate_written_aoi_report, generate_aoi_pdf_stream

    data = _normalize_and_validate_aoi_payload(payload)

    try:
        report = generate_written_aoi_report(data)
        pdf_buffer = generate_aoi_pdf_stream(report)
        safe_name = "".join(c for c in report["region_name"] if c.isalnum() or c in ("-", "_")).strip() or "aoi"
        filename = f"geovision_audit_{safe_name}_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AOI PDF generation failed: {str(e)}")

