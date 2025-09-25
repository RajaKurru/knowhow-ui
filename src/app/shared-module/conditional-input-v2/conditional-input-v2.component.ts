import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

@Component({
  selector: 'app-conditional-input-v2',
  templateUrl: './conditional-input-v2.component.html',
  styleUrls: ['./conditional-input-v2.component.css'],
})
export class ConditionalInputV2Component implements OnChanges {
  @Input() id;
  @Input() fieldConfig;
  @Input() valueObj;
  @Output() conditionalInputChange = new EventEmitter();
  finalValue = [];
  templateData = [];
  templateLabels = [];
  templateDropValues = [
    { name: 'Days', code: 'D' },
    { name: 'Hours', code: 'H' },
  ];
  @HostListener('document:click')
  closeAll() {
    if (this.finalValue) {
      this.finalValue.forEach((opt) => (opt.show = false));
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.valueObj && this.valueObj.length) {
      this.templateLabels = this.templateLabelToLowercase(
        this.valueObj.map((val) => val.label),
      );

      if (
        Array.isArray(this.fieldConfig?.options) &&
        Array.isArray(this.valueObj)
      ) {
        this.fieldConfig.options.forEach((x) => {
          if (!x || !x.label) return;

          const matched = this.valueObj.find(
            (y) => y && y.label && y.label === x.label,
          );

          if (matched) {
            try {
              x.structuredValue =
                matched.structuredValue !== undefined &&
                matched.structuredValue !== null
                  ? JSON.parse(JSON.stringify(matched.structuredValue))
                  : null;
            } catch (e) {
              x.structuredValue = matched.structuredValue ?? null;
            }
          }
        });
      }

      this.templateData = this.fieldConfig.options
        .map((opt) => {
          opt.selected = this.templateLabels.includes(opt.label);
          return opt;
        })
        .filter((opt) => opt.selected);
      this.finalValue = [...this.templateData];
      this.valueObj.forEach((element) => {
        const opt = this.fieldConfig.options.filter(
          (opt) => opt.label === element.label?.toLowerCase(),
        )[0];
        if (opt) {
          opt['structuredValue']['sla'] = element.structuredValue.sla;
        }
      });
    }
  }

  templateLabelToLowercase = (arr: []) =>
    arr.map((val: any) => val?.toLowerCase());

  setValue(event) {
    this.templateLabels = this.templateLabelToLowercase(
      event.value.map((val) => val.label),
    );
    this.templateData = this.fieldConfig.options.filter((opt) =>
      this.templateLabels.includes(opt.label),
    );
    const selectedOption = this.templateData.filter(
      (opt) => opt.label === event.itemValue.label,
    )[0];
    if (selectedOption) {
      selectedOption['structuredValue']['sla'] = selectedOption['minValue'];
    }
    this.setOutput();
  }

  setCounter(event, option) {
    if (!this.templateData.filter((opt) => opt.label === option.label).length) {
      const newOption = JSON.parse(JSON.stringify(option));
      newOption.structuredValue.sla = event.value;
      this.templateData.push(newOption);
    } else {
      this.templateData.filter(
        (opt) => opt.label === option.label,
      )[0].structuredValue.sla = event.value;
    }
    this.setOutput();
  }

  removeFocus(event) {
    event.target.blur();
  }

  setOutput() {
    this.conditionalInputChange.emit(this.finalValue);
  }

  toggleDropdown(event: Event, option) {
    if (!this.finalValue?.includes(option)) {
      return;
    }
    option.show = !option.show;
    event.stopPropagation();
  }
  selectOption(event, item: any, option: any) {
    event.stopPropagation();
    option.structuredValue.timeUnit = item.name;
    option.show = false;
    this.setOutput();
  }
}
