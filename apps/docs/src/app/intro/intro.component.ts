import { AfterViewInit, Component, ViewChild, ViewContainerRef } from '@angular/core';
import md from 'raw-loader!./intro.md';

@Component({
  selector: 'state-adapt-intro',
  templateUrl: `./intro.component.html`,
  styleUrls: ['./intro.component.scss'],
})
export class IntroComponent implements AfterViewInit {
  @ViewChild('circuitsContainer', { static: true, read: ViewContainerRef })
  circuitsContainer!: ViewContainerRef;
  secondary = false;
  md = md;

  constructor(public viewContainerRef: ViewContainerRef) {
    import('../circuits/circuits.component').then(m =>
      this.circuitsContainer.createComponent(m.CircuitsComponent),
    );
  }

  ngAfterViewInit() {
    [...(document as any).querySelectorAll('video')].forEach(v => (v.playbackRate = 0.5));
  }

  MOARRR() {
    (window as any).MOARRR();
  }
}
