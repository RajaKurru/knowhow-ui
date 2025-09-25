import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { HttpService } from 'src/app/services/http.service';
import { SharedService } from 'src/app/services/shared.service';

@Component({
  selector: 'app-recommendations',
  templateUrl: './recommendations.component.html',
  styleUrls: ['./recommendations.component.css'],
})
export class RecommendationsComponent implements OnInit {
  displayModal = false;
  modalDetails = {
    tableHeadings: [],
    tableValues: [],
    kpiId: '',
  };
  recommendationsData: Array<object> = [];
  tabs: Array<string> = [];
  tabsContent: object = {};
  maturities: Array<object> = [];
  filteredMaturity;
  @Input() filterData = {};
  @Input() kpiList = [];
  noRecommendations = false;
  selectedSprint: object = {};
  loading: boolean = false;
  aiRecommendations: boolean = true;

  selectedRole: any = null;
  isRoleSelected: boolean = false;
  readonly roleOptions = [
    { label: 'Executive Sponsor', value: 'executive_sponsor' },
    { label: 'Agile Program Manager', value: 'agile_program_manager' },
    { label: 'Engineering Lead', value: 'engineering_lead' },
  ];

  sprintOptions = [];
  selectedSprints: any[] = [];
  selectedCurrentProjectSprintsCode: any[] = [];
  isSprintSelected: boolean = false;
  allSprints: any;
  kpiFilterData: any;
  isLoading: boolean = false;
  isReportGenerated: boolean = false;
  currentProjectName: string;
  projectScore: number = 0;
  recommendationsList: object[] = [];
  currentDate: string = '';
  recommendationType: any;
  formattedPersona: any;
  isError: boolean = false;
  isTemplateLoading: boolean = false;

  @ViewChild('loadingScreen') loadingScreen: ElementRef;
  @ViewChild('generatedReport') generatedReport: ElementRef;

  private readonly destroy$ = new Subject<void>();
  private readonly cancelCurrentRequest$ = new Subject<void>();

  toShareViaEmail: boolean = false;
  emailIds: string[];
  invalidEmails: string[] = [];
  private readonly emailRegex =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  errorMessage: string = '';
  shouldCloseDialog: boolean = true;
  selectedSprintsLength: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly messageService: MessageService,
    public readonly service: SharedService,
  ) {}

  ngOnInit(): void {
    this.initializeEmailIds();
  }

  private initializeEmailIds(): void {
    const currentUserDetails = localStorage.getItem('currentUserDetails');
    if (currentUserDetails) {
      const currentUserEmailId = JSON.parse(currentUserDetails).user_email;
      this.emailIds = [currentUserEmailId];
    } else {
      this.emailIds = [];
    }
  }

  // This method returns a string to be used as the dialog header
  getDialogHeader(): string {
    // Check if AI recommendations are available
    if (this.aiRecommendations) {
      // If a report has been generated, return 'AI Recommendations Report'
      if (this.isReportGenerated) {
        return 'AI Recommendations Report';
      } else {
        // If no report has been generated yet, return 'Generate AI Recommendation'
        return 'Generate AI Recommendation';
      }
    } else {
      // If AI recommendations are not available, return 'Recommendations for Optimising KPIs'
      return 'Recommendations for Optimising KPIs';
    }
  }

  getCleanRecommendationType(rec: any): string {
    return rec?.replace(/^["']|["']$/g, '') || '';
  }

  handleClick() {
    this.prepareSprintData();
    this.prepareKpiFilterData();
    this.fetchRecommendations();
  }

  private prepareSprintData(): void {
    this.selectedSprint = this.service.getSprintForRnR();
    this.allSprints = this.service.getCurrentProjectSprints();
    const selectedTrend = localStorage.getItem('selectedTrend');
    if (selectedTrend) {
      this.currentProjectName = JSON.parse(selectedTrend)[0]?.nodeDisplayName;
    }
    this.sprintOptions = this.allSprints.map((x) => ({
      name: x['nodeDisplayName'],
      code: x['nodeId'],
    }));
    this.currentDate = this.getCurrentDateFormatted();
  }

  private prepareKpiFilterData(): void {
    this.displayModal = true;
    this.kpiFilterData = JSON.parse(JSON.stringify(this.filterData));
    this.kpiFilterData['kpiIdList'] = [...this.kpiList];
    this.kpiFilterData['selectedMap'] = this.kpiFilterData['selectedMap'] || {};
    this.kpiFilterData['selectedMap']['project'] = [
      Array.isArray(this.selectedSprint?.['parentId'])
        ? this.selectedSprint?.['parentId']?.[0]
        : this.selectedSprint?.['parentId'],
    ];
    this.kpiFilterData['selectedMap']['sprint'] = [
      this.selectedSprint?.['nodeId'],
    ];
  }

  private fetchRecommendations(): void {
    this.loading = true;
    this.maturities = [];
    this.tabs = [];
    this.tabsContent = {};
    this.isTemplateLoading = true;
    this.isReportGenerated = false;
    this.httpService.getRecommendations(this.kpiFilterData).subscribe(
      (response: any) => this.handleRecommendationsResponse(response),
      (error) => this.handleRecommendationsError(error),
    );
  }

  private handleRecommendationsResponse(response: any): void {
    this.aiRecommendations = false;
    this.isTemplateLoading = false;
    if (response.message === 'AiRecommendation') {
      this.aiRecommendations = true;
    } else {
      this.processRecommendations(response);
    }
  }

  private processRecommendations(response: any): void {
    this.aiRecommendations = false;
    if (response?.length > 0) {
      response.forEach((recommendation) => {
        if (this.selectedSprint['nodeId'] == recommendation['sprintId']) {
          if (recommendation?.['recommendations']?.length > 0) {
            this.recommendationsData = recommendation['recommendations'];
            this.populateMaturitiesAndTabs();
            this.noRecommendations = false;
          } else {
            this.noRecommendations = true;
          }
        }
      });
    } else {
      this.noRecommendations = true;
    }
    this.loading = false;
  }

  private populateMaturitiesAndTabs(): void {
    this.recommendationsData.forEach((item) => {
      this.addMaturity(item);
      this.addTab(item);
    });

    this.recommendationsData.forEach((item) => {
      this.tabsContent[item['recommendationType']] = [
        ...this.tabsContent[item['recommendationType']],
        item,
      ];
    });
  }

  private addMaturity(item: any): void {
    const idx = this.maturities?.findIndex(
      (x) => x['value'] == item['maturity'],
    );
    if (idx == -1 && item['maturity']) {
      this.maturities = [
        ...this.maturities,
        {
          name: 'M' + item['maturity'],
          value: item['maturity'],
        },
      ];
    } else {
      this.maturities = [...this.maturities];
    }
  }

  private addTab(item: any): void {
    if (!this.tabs.includes(item['recommendationType'])) {
      this.tabs = [...this.tabs, item['recommendationType']];
    }
    this.tabsContent[item['recommendationType']] = [];
  }

  private handleRecommendationsError(error: any): void {
    console.error(error);
    this.isTemplateLoading = false;
    if (error.msg === 'AiRecommendation') {
      this.aiRecommendations = true;
    } else {
      this.aiRecommendations = false;
      this.messageService.add({
        severity: 'error',
        summary:
          'Error in Kpi Column Configurations. Please try after sometime!',
      });
      this.loading = false;
    }
  }

  selectAllSprints() {
    this.selectedSprints = this.sprintOptions.slice(-6);
    this.onSprintsSelection(this.selectedSprints);
  }

  focusDialogHeader() {
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      this.selectAllSprints();
    }, 300);
  }

  onDialogClose() {
    document.body.style.overflow = 'auto';
    this.resetSelections();
    this.cancelCurrentRequest$.next();
  }

  onRoleChange(event) {
    this.selectedRole = event.value;
    this.isRoleSelected = !!this.selectedRole && this.selectedRole !== '';
    this.formattedPersona = this.roleOptions.filter((x) => {
      if (x.value === this.selectedRole) {
        return x;
      }
    });
  }

  onSprintsSelection(selectedItems: any[]) {
    this.selectedCurrentProjectSprintsCode = (selectedItems || [])
      .filter((item) => item && item.code)
      .map((item) => item.code);
    this.isSprintSelected = this.selectedCurrentProjectSprintsCode.length > 0;
  }

  generateSprintReport() {
    if (this.kpiFilterData) {
      this.kpiFilterData['recommendationFor'] = this.selectedRole;
      this.kpiFilterData['selectedMap']['sprint'] =
        this.selectedCurrentProjectSprintsCode;

      this.isReportGenerated = false;
      this.isLoading = true;
      if (this.isLoading && this.loadingScreen) {
        this.loadingScreen.nativeElement.focus();
      }
      this.isError = false;

      // --- send request body to backend to get sprint data response
      this.getSprintData(this.kpiFilterData);
    }
  }

  getSprintData(reqBody: any): void {
    this.isReportGenerated = false;
    this.cancelCurrentRequest$.next();
    this.httpService
      .getRecommendations(reqBody)
      .pipe(
        takeUntil(this.cancelCurrentRequest$),
        takeUntil(this.destroy$), // Also cancel on component destroy
        finalize(() => {
          // This runs whether completed, errored, or cancelled
          this.isLoading = false;
          if (this.shouldCloseDialog) this.onDialogClose();
        }),
      )
      .subscribe({
        next: (response: any) => this.handleSprintDataResponse(response),
        error: (err) => this.handleSprintDataError(err),
      });
  }

  private handleSprintDataResponse(response: any): void {
    this.isLoading = false;
    if (response?.error) {
      this.handleSprintDataError(response);
    } else {
      this.handleSuccessResponse();
      const resp = response?.data && response?.data[0];
      this.projectScore = +resp?.projectScore || 0;
      this.recommendationsList = resp?.recommendations || [];
    }
  }

  private handleSprintDataError(err: any): void {
    console.error('Failed to fetch sprint recommendations:', err);
    this.errorMessage = err?.originalError?.error?.message;
    this.isError = true;
    this.isLoading = false;
    this.isReportGenerated = false;
    this.isTemplateLoading = false;
    this.shouldCloseDialog = false;
    this.projectScore = 0;
    this.recommendationsList = [];
  }

  private handleSuccessResponse() {
    this.shouldCloseDialog = true;
    this.isReportGenerated = true;
    this.selectedSprintsLength = this.selectedSprints.length;
    if (!this.isLoading && this.generatedReport) {
      this.generatedReport.nativeElement.focus();
    }
    this.isError = false;
  }

  resetSelections() {
    this.selectedRole = null;
    this.selectedSprints = [];
    this.selectedCurrentProjectSprintsCode = [];
    this.isRoleSelected = false;
    this.isSprintSelected = false;
    this.isError = false;
    this.toShareViaEmail = false;
    this.initializeEmailIds();
    this.invalidEmails = [];
  }

  closeCancelLabel() {
    return this.isReportGenerated ? 'Close' : 'Cancel';
  }

  getCurrentDateFormatted(): string {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.cancelCurrentRequest$.complete();
  }

  openShareEmailField(): void {
    this.toShareViaEmail = !this.toShareViaEmail;
  }

  getShareButtonClasses(): string {
    const classes = ['p-button', 'p-ml-4'];
    if (this.toShareViaEmail) {
      classes.push('toggle-on');
    } else {
      classes.push('toggle-off');
    }
    return classes.join(' ');
  }

  validateEmail(event: any): void {
    const email = event.value;

    if (!this.isValidEmail(email)) {
      // Remove invalid email from the array
      this.emailIds = this.emailIds?.filter((e) => e !== email);
      // Add to invalid emails list for display
      if (!this.invalidEmails.includes(email)) {
        this.invalidEmails.push(email);
      }
    } else {
      // Remove from invalid emails list
      this.invalidEmails = this.invalidEmails.filter((e) => e !== email);
    }
  }

  private isValidEmail(email: string): boolean {
    return this.emailRegex.test(email.trim());
  }

  onEmailRemove(event: any): void {
    const removedEmail = event.value;
    // Remove from invalid emails list if present
    this.invalidEmails = this.invalidEmails.filter((e) => e !== removedEmail);
  }

  shareRecommendationViaEmail(pdfAttachment: any): void {
    const payload = {
      recipients: this.emailIds,
      pdfAttachment: pdfAttachment,
    };

    // Send via HTTP client
    this.httpService.shareViaEmail(payload).subscribe({
      next: (response) => {
        this.isTemplateLoading = false;
        if (response && response['success']) {
          this.messageService.add({
            severity: 'success',
            summary: 'Email sent successfully.',
          });
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Error sending email.',
          });
        }
      },
      error: (error) => {
        this.isTemplateLoading = false;
        console.error('Error sending email:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error sending email.',
        });
      },
    });
  }

  private async prepareElementForCapture(element: HTMLElement): Promise<
    Map<
      HTMLElement,
      {
        height: string;
        maxHeight: string;
        overflow: string;
        overflowX: string;
        overflowY: string;
      }
    >
  > {
    // Store original styles
    const originalStyles = new Map<
      HTMLElement,
      {
        height: string;
        maxHeight: string;
        overflow: string;
        overflowX: string;
        overflowY: string;
      }
    >();

    // Find all scrollable containers within the element
    const scrollableElements = Array.from(element.querySelectorAll('*')).filter(
      (el: HTMLElement) => {
        const computedStyle = window.getComputedStyle(el);
        const overflow = computedStyle.overflow;
        const overflowX = computedStyle.overflowX;
        const overflowY = computedStyle.overflowY;
        return (
          overflow === 'auto' ||
          overflow === 'scroll' ||
          overflowX === 'auto' ||
          overflowX === 'scroll' ||
          overflowY === 'auto' ||
          overflowY === 'scroll'
        );
      },
    );

    // Store original styles and modify for capture
    scrollableElements.forEach((el: HTMLElement) => {
      originalStyles.set(el, {
        height: el.style.height,
        maxHeight: el.style.maxHeight,
        overflow: el.style.overflow,
        overflowX: el.style.overflowX,
        overflowY: el.style.overflowY,
      });
      // Modify styles for capture
      el.style.height = 'auto';
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';
      el.style.overflowX = 'visible';
      el.style.overflowY = 'visible';
    });

    return originalStyles;
  }

  private restoreElementStyles(
    originalStyles: Map<
      HTMLElement,
      {
        height: string;
        maxHeight: string;
        overflow: string;
        overflowX: string;
        overflowY: string;
      }
    >,
  ): void {
    originalStyles.forEach((styles, element) => {
      element.style.height = styles.height;
      element.style.maxHeight = styles.maxHeight;
      element.style.overflow = styles.overflow;
      element.style.overflowX = styles.overflowX;
      element.style.overflowY = styles.overflowY;
    });
  }

  async exportAsPDF(toDownload: boolean = true): Promise<void> {
    try {
      this.isTemplateLoading = true;
      const element = document.getElementById('generatedReport');
      const shareDiv = document.getElementById('shareViaEmail');
      const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB in bytes
      let pdfInstance: jsPDF | null = null;

      if (!element) throw new Error('Report element not found');

      // Hide the share div before capturing
      let originalDisplay = null;
      if (shareDiv) {
        originalDisplay = shareDiv.style.display;
        shareDiv.style.display = 'none';
      }

      // Prepare element for full capture
      const originalStyles = await this.prepareElementForCapture(element);

      // Generate canvas with optimized settings
      const canvas = await html2canvas(element, {
        scale: 1.2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        removeContainer: true,
        logging: false,
        imageTimeout: 0,
        height: element.scrollHeight, // Capture full height
        windowHeight: element.scrollHeight, // Set window height to full content
        onclone: (doc) => {
          // Optimize images before capture
          Array.from(doc.getElementsByTagName('img')).forEach((img) => {
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
          });
        },
      });

      // Restore original styles
      this.restoreElementStyles(originalStyles);

      // Restore share div visibility
      if (shareDiv && originalDisplay !== null) {
        shareDiv.style.display = originalDisplay;
      }

      // Start with high quality and reduce if needed
      let quality = 0.9;
      let imgData: string;
      let pdfSize: number;

      do {
        imgData = canvas.toDataURL('image/jpeg', quality);
        pdfInstance = new jsPDF({
          orientation: 'p',
          unit: 'mm',
          format: 'a4',
          compress: true,
          precision: 2,
          filters: ['ASCIIHexEncode'],
        });

        const padding = 20;
        const pageWidth = pdfInstance.internal.pageSize.getWidth();
        const pageHeight = pdfInstance.internal.pageSize.getHeight();

        const imgProps = pdfInstance.getImageProperties(imgData);
        const aspectRatio = imgProps.height / imgProps.width;

        const pdfWidth = pageWidth - 2 * padding;
        const pdfHeight = pdfWidth * aspectRatio;

        const centeredX = (pageWidth - pdfWidth) / 2;
        const startY = padding;

        // Handle multi-page content
        if (pdfHeight < pageHeight) {
          pdfInstance.addImage(
            imgData,
            'JPEG',
            centeredX,
            startY,
            pdfWidth,
            pdfHeight,
            undefined,
            'FAST',
          );
        } else {
          let heightLeft = pdfHeight;
          let position = startY;

          while (heightLeft > 0) {
            pdfInstance.addImage(
              imgData,
              'JPEG',
              centeredX,
              position,
              pdfWidth,
              pdfHeight,
              undefined,
              'FAST',
            );
            heightLeft -= pageHeight;

            if (heightLeft > 0) {
              pdfInstance.addPage();
              position = -heightLeft;
            }
          }
        }

        const pdfOutput = pdfInstance.output('arraybuffer');
        pdfSize = pdfOutput.byteLength;
        quality -= 0.1;

        if (quality < 0.3) {
          this.messageService.add({
            severity: 'warn',
            summary: 'PDF quality reduced to meet size limit',
            detail: 'The generated PDF might have lower image quality',
          });
          break;
        }
      } while (pdfSize > MAX_FILE_SIZE);

      if (toDownload) {
        await pdfInstance.save('project-summary.pdf');
        this.isTemplateLoading = false;
      } else {
        const base64StringPDF = pdfInstance.output('datauristring');
        const base64data = base64StringPDF.split(',')[1];
        await this.shareRecommendationViaEmail(base64data);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.isTemplateLoading = false;
      this.messageService.add({
        severity: 'error',
        summary: 'PDF Generation Failed',
        detail: error.message,
      });
    }
  }

  getIconClass(recommendation) {
    if (!recommendation) return;
    const recommendationType = this.getCleanRecommendationType(
      recommendation.recommendationType,
    ).trim();
    return recommendationType === 'high'
      ? 'pi-exclamation-circle high-icon'
      : recommendationType === 'medium'
      ? 'pi-exclamation-circle medium-icon'
      : recommendationType === 'low'
      ? 'pi-exclamation-circle low-icon'
      : recommendationType === 'critical'
      ? 'pi-exclamation-triangle critical-icon'
      : '';
  }

  getSeverityBackgroundColor(recommendation: any) {
    if (!recommendation) return {};

    const recommendationType = this.getCleanRecommendationType(
      recommendation.recommendationType,
    ).trim();

    switch (recommendationType) {
      case 'high':
        return { 'background-color': '#f68605', color: 'fff#' };
      case 'medium':
        return {
          'background-color': '#fbcf5f',
          color: '#fff',
        };
      case 'low':
        return { 'background-color': '#49535e', color: 'fff#' };
      case 'critical':
        return { 'background-color': '#fe414d', color: '#fff' };
      default:
        return { 'background-color': '#fe414d', color: '#fff' };
    }
  }
  getSeverityClass(recommendation: any) {
    if (!recommendation) return '';

    const recommendationType = this.getCleanRecommendationType(
      recommendation.recommendationType,
    ).trim();

    switch (recommendationType) {
      case 'high':
        return 'high-icon';
      case 'medium':
        return 'medium-icon';
      case 'low':
        return 'low-icon';
      case 'critical':
        return 'critical-icon';
      default:
        return 'critical-icon';
    }
  }
  formatKpiLabel(kpi: string): string {
    if (!kpi) return '';
    return kpi
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
