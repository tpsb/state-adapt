import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HtmlComponent } from '@state-adapt/adapter-docs';

import { ContentComponent } from '../content.component';
import html from './sources.md';

@Component({
  standalone: true,
  selector: 'sa-sources',
  imports: [RouterModule, ContentComponent, HtmlComponent],
  template: `
    <sa-content>
      <sa-html [html]="html"></sa-html>
      <h2><a routerLink="/concepts/adapters">Next: Adapters</a></h2>
      <h2><a routerLink="/concepts/overview">Previous: Overview</a></h2>
    </sa-content>
  `,
})
export class SourcesComponent {
  html = html;
}
